import React, { useMemo, useState } from "react";
import {
  Alert, Platform, SafeAreaView, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const C = {
  bg:"#081426", panel:"#11223D", panel2:"#172B49", line:"#2B4262",
  text:"#F1F5FB", muted:"#A9B8CC", blue:"#3985F6",
  green:"#27AE73", amber:"#D69A32", red:"#E36A6A", empty:"#50627C"
};
const fmt = n => Math.round(n).toLocaleString("tr-TR");
const num = v => Math.max(0, Number(String(v ?? "").replace(",", ".")) || 0);
const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])
);

const initialEyes = () => Array.from({length:6}, (_,i)=>({id:`eye-${i+1}`,capacity:"5000"}));
// Aytemiz ürün kataloğu: dizel Optimum + Motorin; benzin yalnızca 95 oktan.
const initialProducts = () => [
  {id:"p1",name:"Optimum",liters:"12000"},
  {id:"p2",name:"Motorin",liters:"8000"},
  {id:"p3",name:"95 Oktan Kurşunsuz Benzin",liters:"4000"}
];

function distribute(eyes, products) {
  const free = eyes.map(e=>num(e.capacity));
  const allocations = eyes.map(()=>null);
  const leftovers = [];
  let eyeIndex = 0;

  products.forEach(product => {
    let need = num(product.liters);
    const name = product.name.trim() || "İsimsiz ürün";
    while (need > 0 && eyeIndex < eyes.length) {
      if (free[eyeIndex] <= 0) { eyeIndex++; continue; }
      const amount = Math.min(need, free[eyeIndex]);
      allocations[eyeIndex] = {name, liters:amount};
      free[eyeIndex] -= amount;
      need -= amount;
      // Bir göze yalnızca tek ürün atanır; sonraki ürün sonraki gözden başlar.
      eyeIndex++;
    }
    if (need > 0) leftovers.push({name,liters:need});
  });
  return {allocations,free,leftovers};
}

function productColor(name) {
  const s = name.toLocaleLowerCase("tr-TR");
  if (s.includes("optimum") || s.includes("motorin")) return C.amber;
  if (s.includes("benzin")) return "#3999E8";
  return C.green;
}

function reportHTML(eyes, products, plan, capacity, demand) {
  const productRows = products.map(p =>
    `<tr><td>${escapeHTML(p.name || "İsimsiz ürün")}</td><td>${fmt(num(p.liters))} L</td></tr>`
  ).join("");
  const eyeRows = eyes.map((e,i) => {
    const a = plan.allocations[i], cap = num(e.capacity), filled = a ? a.liters : 0;
    return `<tr><td>Göz ${i+1}</td><td>${escapeHTML(a ? a.name : "Boş")}</td>
      <td>${fmt(filled)} L</td><td>${fmt(cap)} L</td>
      <td>${cap ? Math.round(filled/cap*100) : 0}%</td>
      <td>${fmt(Math.max(0,cap-filled))} L</td></tr>`;
  }).join("");
  const warning = plan.leftovers.length
    ? `<div class="warn"><b>Kapasite yetersiz</b><br>${plan.leftovers.map(x=>`${escapeHTML(x.name)}: ${fmt(x.liters)} L dağıtılamadı`).join("<br>")}</div>`
    : `<div class="ok">Girilen ürün taleplerinin tamamı gözlere dağıtıldı.</div>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>TankerPlan Yükleme Planı</title>
  <style>
  body{font-family:Arial,sans-serif;color:#172033;padding:22px}h1{color:#10284a;margin-bottom:3px}
  .muted{color:#64748b}.cards{display:flex;gap:10px;margin:20px 0}
  .card{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:12px}
  table{width:100%;border-collapse:collapse;margin:12px 0 22px;font-size:12px}
  th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#edf3fa}
  .ok,.warn{padding:12px;margin-top:14px}.ok{background:#e7f7ed;border:1px solid #9bd4ad}
  .warn{background:#fff4df;border:1px solid #e9c77c}.foot{font-size:10px;color:#64748b;line-height:1.5;margin-top:25px}
  </style></head><body><h1>TankerPlan</h1>
  <p class="muted">Akaryakıt Tankeri Yükleme Planı · ${new Date().toLocaleString("tr-TR")}</p>
  <div class="cards"><div class="card"><b>Toplam kapasite</b><br>${fmt(capacity)} L</div>
  <div class="card"><b>Ürün talebi</b><br>${fmt(demand)} L</div>
  <div class="card"><b>Göz sayısı</b><br>${eyes.length}</div></div>
  <h2>Ürün talepleri</h2><table><tr><th>Ürün</th><th>Talep</th></tr>${productRows}</table>
  <h2>Göz bazında yükleme dağılımı</h2>
  <table><tr><th>Göz</th><th>Ürün</th><th>Yüklenecek</th><th>Kapasite</th><th>Doluluk</th><th>Boş kapasite</th></tr>${eyeRows}</table>
  ${warning}<p class="foot">Bu rapor planlama amaçlıdır. Gerçek yükleme öncesinde ürün uyumluluğu, tanker bölme yapısı, ağırlık limitleri, dolum prosedürleri ve güvenlik kontrolleri yetkili kişilerce doğrulanmalıdır.</p>
  </body></html>`;
}

export default function App() {
  const [eyes,setEyes] = useState(initialEyes);
  const [products,setProducts] = useState(initialProducts);
  const [busy,setBusy] = useState(false);
  const plan = useMemo(()=>distribute(eyes,products),[eyes,products]);
  const capacity = eyes.reduce((s,e)=>s+num(e.capacity),0);
  const demand = products.reduce((s,p)=>s+num(p.liters),0);
  const allocated = plan.allocations.reduce((s,a)=>s+(a ? a.liters : 0),0);
  const notAllocated = plan.leftovers.reduce((s,x)=>s+x.liters,0);

  const changeEye = (id,value) => setEyes(old=>old.map(e=>e.id===id?{...e,capacity:value}:e));
  const changeProduct = (id,key,value) => setProducts(old=>old.map(p=>p.id===id?{...p,[key]:value}:p));

  const addEye = () => {
    if (eyes.length < 16) setEyes(old=>[...old,{id:`eye-${Date.now()}`,capacity:"5000"}]);
  };
  const deleteEye = id => {
    if (eyes.length <= 1) return Alert.alert("Bilgi","En az bir tanker gözü bulunmalıdır.");
    setEyes(old=>old.filter(e=>e.id!==id));
  };
  const addProduct = () => setProducts(old=>[...old,{id:`p-${Date.now()}`,name:"",liters:""}]);
  const reset = () => Alert.alert("Örnek veriler","Örnek bilgiler yüklensin mi?",[
    {text:"Vazgeç",style:"cancel"},
    {text:"Yükle",onPress:()=>{setEyes(initialEyes());setProducts(initialProducts());}}
  ]);

  async function makePDF() {
    if (busy) return;
    setBusy(true);
    try {
      const html = reportHTML(eyes,products,plan,capacity,demand);
      if (Platform.OS === "web") {
        await Print.printAsync({html});
      } else {
        const file = await Print.printToFileAsync({html,base64:false});
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri,{
            mimeType:"application/pdf",
            dialogTitle:"TankerPlan PDF raporunu kaydet veya paylaş",
            UTI:"com.adobe.pdf"
          });
        } else {
          Alert.alert("PDF hazır",file.uri);
        }
      }
    } catch (e) {
      Alert.alert("PDF oluşturulamadı",e?.message || "Lütfen yeniden deneyin.");
    } finally { setBusy(false); }
  }

  async function printPlan() {
    if (busy) return;
    setBusy(true);
    try {
      await Print.printAsync({html:reportHTML(eyes,products,plan,capacity,demand)});
    } catch (e) {
      Alert.alert("Yazdırma açılamadı",e?.message || "Lütfen yeniden deneyin.");
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View><Text style={s.brand}>Tanker<Text style={{color:"#66A7FF"}}>Plan</Text></Text>
          <Text style={s.kicker}>AKARYAKIT TANKERİ YÜKLEME PLANLAYICI</Text></View>
          <Text style={s.sdk}>SDK 58</Text>
        </View>

        <View style={s.stats}>
          <View style={s.stat}><Text style={s.muted}>Toplam kapasite</Text><Text style={s.statValue}>{fmt(capacity)} L</Text></View>
          <View style={s.stat}><Text style={s.muted}>Ürün talebi</Text><Text style={s.statValue}>{fmt(demand)} L</Text></View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <View><Text style={s.heading}>1. Tanker gözleri</Text><Text style={s.helper}>{eyes.length} / 16 göz tanımlı</Text></View>
            <TouchableOpacity disabled={eyes.length>=16} style={[s.btn,eyes.length>=16&&s.disabled]} onPress={addEye}><Text style={s.btnText}>＋ Göz ekle</Text></TouchableOpacity>
          </View>
          {eyes.map((eye,i)=><View style={s.eyeRow} key={eye.id}>
            <Text style={s.eyeName}>Göz {i+1}</Text>
            <TextInput style={[s.input,s.eyeInput]} value={eye.capacity} onChangeText={v=>changeEye(eye.id,v)} keyboardType="decimal-pad" placeholder="Kapasite L" placeholderTextColor={C.muted}/>
            <Text style={s.unit}>L</Text>
            <TouchableOpacity onPress={()=>deleteEye(eye.id)}><Text style={s.delete}>Sil</Text></TouchableOpacity>
          </View>)}
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <View><Text style={s.heading}>2. Ürün ve litre talepleri</Text><Text style={s.helper}>Ürün adı ve istenen miktarı girin.</Text></View>
            <TouchableOpacity style={s.btn} onPress={addProduct}><Text style={s.btnText}>＋ Ürün</Text></TouchableOpacity>
          </View>
          {products.map((p,i)=><View style={s.product} key={p.id}>
            <View style={s.productHead}><Text style={s.productTitle}>Ürün {i+1}</Text><TouchableOpacity onPress={()=>setProducts(old=>old.filter(x=>x.id!==p.id))}><Text style={s.delete}>Ürünü sil</Text></TouchableOpacity></View>
            <Text style={s.fieldLabel}>Ürün adı</Text>
            <TextInput style={s.input} value={p.name} onChangeText={v=>changeProduct(p.id,"name",v)} placeholder="Örn. Motorin" placeholderTextColor={C.muted}/>
            <Text style={s.fieldLabel}>Talep edilen litre</Text>
            <TextInput style={s.input} value={p.liters} onChangeText={v=>changeProduct(p.id,"liters",v)} keyboardType="decimal-pad" placeholder="Örn. 12000" placeholderTextColor={C.muted}/>
          </View>)}
        </View>

        <View style={s.section}>
          <View style={s.sectionHead}>
            <View><Text style={s.heading}>3. Otomatik yük dağıtımı</Text><Text style={s.helper}>Her göze tek ürün atanır.</Text></View>
            <TouchableOpacity style={s.secondary} onPress={reset}><Text style={s.btnText}>Örnek veriler</Text></TouchableOpacity>
          </View>
          <View style={s.tanker}>
            <View style={s.tankerHead}><Text style={s.tankerTitle}>🚛 TANKER GÖRÜNÜMÜ</Text><Text style={s.helper}>{eyes.length} bölme</Text></View>
            <View style={s.grid}>
              {eyes.map((eye,i)=>{
                const item=plan.allocations[i], cap=num(eye.capacity), filled=item?item.liters:0;
                const pct=cap?Math.min(100,filled/cap*100):0;
                return <View style={s.compartment} key={eye.id}>
                  <View style={[s.fill,{height:`${pct}%`,backgroundColor:item?productColor(item.name):C.empty}]}/>
                  <View style={s.compText}>
                    <Text style={s.compNo}>GÖZ {i+1}</Text>
                    <Text style={s.compProduct} numberOfLines={2}>{item?item.name:"Boş"}</Text>
                    <Text style={s.compLiters}>{fmt(filled)} / {fmt(cap)} L</Text>
                    <Text style={s.compPct}>{Math.round(pct)}%</Text>
                  </View>
                </View>;
              })}
            </View>
          </View>
          <View style={s.summary}><Text style={s.muted}>Dağıtılan toplam</Text><Text style={s.summaryValue}>{fmt(allocated)} L</Text></View>
          <View style={s.summary}><Text style={s.muted}>Dağıtılamayan toplam</Text><Text style={[s.summaryValue,notAllocated>0&&{color:C.red}]}>{fmt(notAllocated)} L</Text></View>
          {plan.leftovers.length>0?<View style={s.warning}>
            <Text style={s.warningTitle}>⚠ Tanker kapasitesi yetersiz</Text>
            {plan.leftovers.map((x,i)=><Text style={s.warningText} key={i}>{x.name}: {fmt(x.liters)} L dağıtılamadı</Text>)}
          </View>:<View style={s.success}><Text style={s.successText}>✓ Girilen ürün talepleri gözlere dağıtıldı.</Text></View>}
        </View>

        <View style={s.section}>
          <Text style={s.heading}>4. Yazdırma ve PDF</Text>
          <Text style={s.helper}>PDF raporunu oluşturun, iPhone'da Dosyalar'a kaydedin veya yazdırın.</Text>
          <View style={s.exportRow}>
            <TouchableOpacity disabled={busy} style={[s.btn,s.exportBtn,busy&&s.disabled]} onPress={makePDF}><Text style={s.btnText}>{busy?"Hazırlanıyor...":"PDF kaydet / paylaş"}</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} style={[s.secondary,s.exportBtn,busy&&s.disabled]} onPress={printPlan}><Text style={s.btnText}>Yazdır</Text></TouchableOpacity>
          </View>
        </View>

        <Text style={s.disclaimer}>Güvenlik notu: Bu uygulama planlama prototipidir. Gerçek yükleme öncesinde ürün uyumluluğu, tanker bölme yapısı, ağırlık limitleri, dolum prosedürleri ve güvenlik kontrolleri yetkili kişilerce ayrıca doğrulanmalıdır.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},content:{padding:15,paddingBottom:35},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:8,marginBottom:18},
  brand:{color:C.text,fontSize:30,fontWeight:"900",letterSpacing:-.8},
  kicker:{color:"#8EAFD9",fontSize:9,letterSpacing:1,marginTop:3},
  sdk:{color:"#C7DDFB",borderColor:"#42618B",borderWidth:1,borderRadius:20,paddingHorizontal:10,paddingVertical:7,fontSize:11,fontWeight:"700"},
  stats:{flexDirection:"row",gap:9},stat:{flex:1,backgroundColor:C.panel,borderColor:C.line,borderWidth:1,borderRadius:13,padding:13},
  muted:{color:C.muted,fontSize:12},statValue:{color:C.text,fontSize:19,fontWeight:"800",marginTop:6},
  section:{backgroundColor:C.panel,borderColor:C.line,borderWidth:1,borderRadius:15,padding:13,marginTop:13},
  sectionHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:11},
  heading:{color:C.text,fontSize:16,fontWeight:"800"},helper:{color:C.muted,fontSize:11,marginTop:4,flexShrink:1},
  btn:{backgroundColor:C.blue,borderRadius:9,paddingHorizontal:11,paddingVertical:10},
  secondary:{backgroundColor:"#29415F",borderColor:"#3C587A",borderWidth:1,borderRadius:9,paddingHorizontal:11,paddingVertical:10},
  btnText:{color:"#fff",fontSize:11,fontWeight:"800"},disabled:{opacity:.45},
  eyeRow:{flexDirection:"row",alignItems:"center",gap:7,marginVertical:5},
  eyeName:{width:48,color:C.text,fontWeight:"700",fontSize:12},
  input:{backgroundColor:"#09182D",borderWidth:1,borderColor:"#344B6A",borderRadius:9,color:C.text,paddingHorizontal:10,paddingVertical:10,fontSize:14,minHeight:42},
  eyeInput:{flex:1},unit:{color:C.muted,fontSize:11},delete:{color:"#F2A0A0",fontSize:11,fontWeight:"700",padding:5},
  product:{backgroundColor:C.panel2,borderRadius:11,padding:10,marginTop:8},
  productHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:5},
  productTitle:{color:C.text,fontWeight:"800",fontSize:13},fieldLabel:{color:C.muted,fontSize:11,marginTop:6,marginBottom:3},
  tanker:{backgroundColor:"#09182D",borderWidth:1,borderColor:"#3B5272",borderRadius:17,padding:11,marginTop:9},
  tankerHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:11},
  tankerTitle:{color:"#DDEBFC",fontSize:12,fontWeight:"900"},
  grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"flex-start",gap:7},
  compartment:{width:"31%",height:112,borderRadius:10,borderWidth:1,borderColor:"#536B8A",backgroundColor:"#142944",overflow:"hidden",justifyContent:"flex-end"},
  fill:{position:"absolute",bottom:0,left:0,right:0,opacity:.86},
  compText:{padding:6},compNo:{color:"#fff",fontSize:9,fontWeight:"900"},
  compProduct:{color:"#fff",fontSize:10,fontWeight:"800",marginTop:4},
  compLiters:{color:"#F0F5FC",fontSize:9,marginTop:3},compPct:{color:"#fff",fontSize:10,fontWeight:"900",marginTop:2},
  summary:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:11},
  summaryValue:{color:C.text,fontWeight:"800",fontSize:13},
  warning:{backgroundColor:"#3B2A16",borderColor:"#8D652B",borderWidth:1,borderRadius:10,padding:11,marginTop:12},
  warningTitle:{color:"#FFD58C",fontWeight:"900",marginBottom:5},warningText:{color:"#F8D9A4",fontSize:12,marginTop:3},
  success:{backgroundColor:"#103524",borderColor:"#236B48",borderWidth:1,borderRadius:10,padding:11,marginTop:12},
  successText:{color:"#A7F3C5",fontWeight:"700",fontSize:12},
  exportRow:{flexDirection:"row",gap:9,marginTop:12},exportBtn:{flex:1,alignItems:"center"},
  disclaimer:{color:"#91A5C0",fontSize:10,lineHeight:15,marginTop:15}
});
