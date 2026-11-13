import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const STORAGE_KEY = "TANKERPLAN_VEHICLES_V1";

const CATALOG = {
  Shell: ["V-Power Diesel", "V-Power Kurşunsuz 95"],
  Opet: ["Ultra Force Motorin", "Ultra Force 95"],
  TotalEnergies: [
    "Excellium Motorin",
    "Motorin",
    "Excellium Kurşunsuz 95",
  ],
  Aytemiz: [
    "Optimum",
    "Motorin",
    "95 Oktan Kurşunsuz Benzin",
  ],
  "Petrol Ofisi": [
    "V/Max Diesel",
    "V/Max Kurşunsuz 95",
  ],
};

const COMPANIES = Object.keys(CATALOG);

// Yaklaşık litre kesafeti (kg/litre).
// Sevkiyata ait analiz/ölçüm belgesindeki değer esas alınmalıdır.
const DEFAULT_DENSITY = (product) =>
  /95|benzin|kurşunsuz/i.test(product) ? "0.750" : "0.835";

const PRODUCT_COLORS = {
  "V-Power Diesel": "#2563EB",
  "V-Power Kurşunsuz 95": "#DC2626",
  "Ultra Force Motorin": "#0D9488",
  "Ultra Force 95": "#EA580C",
  "Excellium Motorin": "#7C3AED",
  "Motorin": "#64748B",
  "Excellium Kurşunsuz 95": "#DB2777",
  "Optimum": "#16A34A",
  "95 Oktan Kurşunsuz Benzin": "#D97706",
  "V/Max Diesel": "#0891B2",
  "V/Max Kurşunsuz 95": "#9333EA",
};

const makeId = () =>
  Date.now().toString() + Math.random().toString(36).slice(2, 7);

const normalizePlate = (value) =>
  value.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim();

const parseWeightKg = (value) => Number(String(value || "").replace(/\./g, "").replace(",", ".")) || 0;

const parseLiters = (value) => {
  const cleaned = String(value || "").replace(/[^\d]/g, "");
  return Number(cleaned) || 0;
};

const formatLiters = (value) =>
  Number(value || 0).toLocaleString("tr-TR");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));

function createPlanReportHtml({ plan, plate, trailerPlate, vehicleType, eyes }) {
  const createdAt = new Date().toLocaleString("tr-TR");
  const vehicleLabel = vehicleType === "tractor_semitrailer"
    ? `Çekici: ${plate || "—"} · Yarı römork: ${trailerPlate || "—"}`
    : `Kamyon: ${plate || "—"}`;

  const allocationRows = plan.allocations.map((item) => `
    <tr>
      <td>${item.eyeNumber}. Göz</td>
      <td>${escapeHtml(item.company)}</td>
      <td>${escapeHtml(item.dealer)}</td>
      <td>${escapeHtml(item.product)}</td>
      <td class="number">${formatLiters(item.loaded)} L</td>
      <td class="number">${formatLiters(item.capacity)} L</td>
      <td class="number">${Number(item.densityKgPerL).toLocaleString("tr-TR")} kg/L</td>
      <td class="number">${formatLiters(Math.round(item.loaded * item.densityKgPerL))} kg</td>
    </tr>`).join("");

  const taskRows = plan.tasks.map((task) => `
    <tr>
      <td>${escapeHtml(task.company)}</td>
      <td>${escapeHtml(task.dealer)}</td>
      <td>${escapeHtml(task.product)}</td>
      <td class="number">${formatLiters(task.demand)} L</td>
      <td class="number">${formatLiters(task.remaining)} L</td>
    </tr>`).join("");

  const emptyEyes = plan.emptyEyes.length
    ? plan.emptyEyes.map((eye) => `${eye.number}. Göz`).join(", ")
    : "Yok";

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TankerPlan Yükleme Planı - ${escapeHtml(plate || "Araç")}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #17364d; margin: 0; font-size: 10px; }
  header { border-bottom: 3px solid #e11d2e; padding-bottom: 12px; margin-bottom: 14px; }
  h1 { margin: 0; font-size: 23px; color: #102d45; }
  .subtitle { margin-top: 4px; color: #647684; font-size: 11px; }
  .meta { display: flex; justify-content: space-between; gap: 16px; margin: 12px 0; font-size: 11px; }
  .summary { display: flex; gap: 8px; margin: 12px 0 16px; }
  .summary div { flex: 1; background: #edf2f5; border-radius: 6px; padding: 9px; }
  .summary b { display: block; font-size: 15px; margin-top: 4px; color: #102d45; }
  h2 { font-size: 13px; margin: 16px 0 7px; color: #102d45; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #102d45; color: white; text-align: left; }
  th, td { border: 1px solid #d8e0e6; padding: 6px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .number { text-align: right; white-space: nowrap; }
  .warning { background: #fff5e8; border: 1px solid #f1d3a9; padding: 8px; border-radius: 5px; margin-top: 8px; }
  .note { color: #647684; font-size: 9px; line-height: 1.5; margin-top: 14px; }
  footer { border-top: 1px solid #d8e0e6; padding-top: 8px; margin-top: 18px; color: #647684; font-size: 9px; }
</style>
</head>
<body>
<header>
  <h1>TankerPlan</h1>
  <div class="subtitle">Akaryakıt Tankeri Yükleme Planı</div>
</header>
<div class="meta"><strong>${escapeHtml(vehicleLabel)}</strong><span>Oluşturulma: ${escapeHtml(createdAt)}</span></div>
<div class="summary">
  <div>Toplam talep<b>${formatLiters(plan.totalDemand)} L</b></div>
  <div>Yüklenecek<b>${formatLiters(plan.totalLoaded)} L</b></div>
  <div>Karşılanamayan<b>${formatLiters(plan.unallocated)} L</b></div>
  <div>Tahmini ürün ağırlığı<b>${formatLiters(Math.round(plan.totalMassKg))} kg</b></div>
  <div>Toplam tanker kapasitesi<b>${formatLiters(eyes.reduce((sum, eye) => sum + eye.capacity, 0))} L</b></div>
</div>
<h2>Göz Bazında Yükleme Listesi</h2>
<table>
<thead><tr><th>Göz</th><th>Dağıtım şirketi</th><th>Bayi</th><th>Ürün</th><th class="number">Yüklenecek</th><th class="number">Göz kapasitesi</th><th class="number">Kesafet</th><th class="number">Tahmini ağırlık</th></tr></thead>
<tbody>${allocationRows || '<tr><td colspan="8">Yükleme bulunamadı.</td></tr>'}</tbody>
</table>
<h2>Ürün Talep Özeti</h2>
<table>
<thead><tr><th>Dağıtım şirketi</th><th>Bayi</th><th>Ürün</th><th class="number">Talep</th><th class="number">Karşılanamayan</th></tr></thead>
<tbody>${taskRows || '<tr><td colspan="5">Talep bulunamadı.</td></tr>'}</tbody>
</table>
<div class="warning"><strong>Boş kalan gözler:</strong> ${escapeHtml(emptyEyes)}</div>
${plan.unallocated > 0 ? `<div class="warning"><strong>Uyarı:</strong> ${formatLiters(plan.unallocated)} L ürün talebi karşılanamadı.</div>` : ""}
<p class="note">Kesafet değerleri yaklaşık varsayılandır; ağırlık hesabı tahminidir. Gerçek sevkiyat için analiz belgesi veya ölçüm sertifikasındaki değer esas alınmalıdır. Bu rapor yükleme planlama amacıyla hazırlanmıştır; gerçek yükleme ve araç ağırlık kontrollerinin yerini almaz.</p>
<footer>TANKERPLAN · Tasarım ve Geliştirme: Halim Pirselimoğlu</footer>
</body>
</html>`;
}

function makeDealer() {
  return {
    id: makeId(),
    company: "Shell",
    name: "",
    products: CATALOG.Shell.map((product) => ({
      name: product,
      liters: "",
      densityKgPerL: DEFAULT_DENSITY(product),
    })),
  };
}

function findBestCombination(eyes, demand, prioritizeFront) {
  if (!eyes.length || demand <= 0) return null;

  let best = null;
  const totalMasks = 1 << eyes.length;
  // Kalan gözler numara sırasıyla gelir. %85 altında her adımda
  // sıradaki en ön göz kombinasyona dahil edilerek 2., 3. göz atlanmaz.
  const firstEyeIndex = 0;

  for (let mask = 1; mask < totalMasks; mask++) {
    if (prioritizeFront && !(mask & (1 << firstEyeIndex))) continue;

    const selected = [];
    let total = 0;
    for (let i = 0; i < eyes.length; i++) {
      if (mask & (1 << i)) {
        selected.push(eyes[i]);
        total += eyes[i].capacity;
      }
    }

    const exact = total === demand;
    const enough = total >= demand;
    const excess = Math.max(0, total - demand);
    const candidate = { selected, total, exact, enough, excess };

    if (!best) {
      best = candidate;
      continue;
    }

    let better = false;
    if (candidate.exact !== best.exact) {
      better = candidate.exact;
    } else if (candidate.enough !== best.enough) {
      better = candidate.enough;
    } else if (candidate.enough) {
      if (candidate.excess !== best.excess) {
        better = candidate.excess < best.excess;
      } else if (prioritizeFront &&
        candidate.selected[0].number !== best.selected[0].number) {
        better = candidate.selected[0].number < best.selected[0].number;
      } else if (candidate.selected.length !== best.selected.length) {
        better = candidate.selected.length < best.selected.length;
      } else if (!prioritizeFront) {
        better = candidate.selected[0].number < best.selected[0].number;
      }
    } else {
      if (candidate.total !== best.total) {
        better = candidate.total > best.total;
      } else if (prioritizeFront &&
        candidate.selected[0].number !== best.selected[0].number) {
        better = candidate.selected[0].number < best.selected[0].number;
      } else if (candidate.selected.length !== best.selected.length) {
        better = candidate.selected.length < best.selected.length;
      } else if (!prioritizeFront) {
        better = candidate.selected[0].number < best.selected[0].number;
      }
    }

    if (better) best = candidate;
  }

  return best;
}
function createLoadingPlan(eyes, dealers) {
  const freeEyes = eyes
    .filter((eye) => eye.capacity > 0)
    .map((eye) => ({ ...eye }));

  const totalTankCapacity = freeEyes.reduce((sum, eye) => sum + eye.capacity, 0);
  const totalRequestedLiters = dealers.reduce((sum, dealer) =>
    sum + dealer.products.reduce((productSum, product) =>
      productSum + parseLiters(product.liters), 0), 0);
  const fillRatio = totalTankCapacity > 0
    ? totalRequestedLiters / totalTankCapacity
    : 0;
  // %85'in altında ön göz önceliği; %85 ve üzerinde en iyi kapasite eşleşmesi.
  const prioritizeFront = fillRatio < 0.85;

  const tasks = [];

  dealers.forEach((dealer, dealerIndex) => {
    dealer.products.forEach((product, productIndex) => {
      const liters = parseLiters(product.liters);

      if (liters > 0) {
        tasks.push({
          id: `${dealer.id}-${productIndex}`,
          dealer: dealer.name || `Bayi ${dealerIndex + 1}`,
          company: dealer.company,
          product: product.name,
          densityKgPerL: Number(String(product.densityKgPerL ?? "").replace(",", ".")) || Number(DEFAULT_DENSITY(product.name)),
          demand: liters,
          remaining: liters,
          dealerIndex,
          productIndex,
          allocations: [],
        });
      }
    });
  });

  const allocations = [];
  let remainingEyes = [...freeEyes];

  while (remainingEyes.length > 0) {
    const activeTasks = tasks.filter(
      (task) => task.remaining > 0
    );

    if (!activeTasks.length) break;

    let bestTask = null;
    let bestCombo = null;

    activeTasks.forEach((task) => {
      const combo = findBestCombination(
        remainingEyes,
        task.remaining,
        prioritizeFront
      );

      if (!combo) return;

      if (!bestTask) {
        bestTask = task;
        bestCombo = combo;
        return;
      }

      let better = false;

      // %85 altında sıradaki ön gözü tam doldurabilecek ürünü önce seç.
      const frontEye = remainingEyes[0];
      const canFillFront = prioritizeFront &&
        frontEye &&
        task.remaining >= frontEye.capacity &&
        combo.selected.some((eye) => eye.id === frontEye.id);
      const bestCanFillFront = prioritizeFront &&
        frontEye &&
        bestTask.remaining >= frontEye.capacity &&
        bestCombo.selected.some((eye) => eye.id === frontEye.id);

      if (prioritizeFront && canFillFront !== bestCanFillFront) {
        better = canFillFront;
      } else if (combo.exact && !bestCombo.exact) {
        better = true;
      } else if (!combo.exact && bestCombo.exact) {
        better = false;
      } else if (combo.enough && !bestCombo.enough) {
        better = true;
      } else if (!combo.enough && bestCombo.enough) {
        better = false;
      } else if (combo.enough && bestCombo.enough) {
        if (combo.excess < bestCombo.excess) {
          better = true;
        } else if (
          combo.excess === bestCombo.excess &&
          prioritizeFront &&
          combo.selected[0].number < bestCombo.selected[0].number
        ) {
          better = true;
        } else if (
          combo.excess === bestCombo.excess &&
          (!prioritizeFront ||
            combo.selected[0].number === bestCombo.selected[0].number) &&
          combo.selected.length < bestCombo.selected.length
        ) {
          better = true;
        } else if (
          combo.excess === bestCombo.excess &&
          combo.selected.length === bestCombo.selected.length &&
          combo.selected[0].number < bestCombo.selected[0].number
        ) {
          better = true;
        } else if (
          combo.excess === bestCombo.excess &&
          combo.selected.length === bestCombo.selected.length &&
          combo.selected[0].number === bestCombo.selected[0].number &&
          task.dealerIndex < bestTask.dealerIndex
        ) {
          better = true;
        }
      } else if (combo.total > bestCombo.total) {
        better = true;
      } else if (
        combo.total === bestCombo.total &&
        prioritizeFront &&
        combo.selected[0].number < bestCombo.selected[0].number
      ) {
        better = true;
      } else if (
        combo.total === bestCombo.total &&
        (!prioritizeFront ||
          combo.selected[0].number === bestCombo.selected[0].number) &&
        combo.selected.length < bestCombo.selected.length
      ) {
        better = true;
      } else if (
        combo.total === bestCombo.total &&
        combo.selected.length === bestCombo.selected.length &&
        combo.selected[0].number < bestCombo.selected[0].number
      ) {
        better = true;
      } else if (
        combo.total === bestCombo.total &&
        combo.selected.length === bestCombo.selected.length &&
        combo.selected[0].number === bestCombo.selected[0].number &&
        task.dealerIndex < bestTask.dealerIndex
      ) {
        better = true;
      }
      if (better) {
        bestTask = task;
        bestCombo = combo;
      }
    });

    if (!bestTask || !bestCombo) break;

    const selectedEyes = [...bestCombo.selected].sort(
      (a, b) => a.number - b.number
    );

    const totalCapacity = selectedEyes.reduce(
      (sum, eye) => sum + eye.capacity,
      0
    );

    let partialEye = null;
    let partialLiters = 0;

    if (totalCapacity !== bestTask.remaining) {
      const center = (eyes.length + 1) / 2;

      const candidates = selectedEyes
        .map((eye) => {
          const otherCapacity = totalCapacity - eye.capacity;
          const required = bestTask.remaining - otherCapacity;

          return {
            eye,
            required,
            distance: Math.abs(eye.number - center),
          };
        })
        .filter(
          (item) =>
            item.required > 0 &&
            item.required < item.eye.capacity
        )
        .sort((a, b) => {
          if (prioritizeFront) {
            // Ön göz dolu kalsın; gerekiyorsa kısmi dolumu seçilen arka gözde yap.
            return b.eye.number - a.eye.number;
          }
          if (a.distance !== b.distance) {
            return a.distance - b.distance;
          }
          return a.eye.number - b.eye.number;
        });

      if (candidates.length > 0) {
        partialEye = candidates[0].eye;
        partialLiters = candidates[0].required;
      } else {
        // Uygun bir kısmi göz yoksa mevcut göz sırası korunur.
        let remaining = bestTask.remaining;

        selectedEyes.forEach((eye) => {
          if (remaining <= 0) return;

          const loaded = Math.min(eye.capacity, remaining);
          remaining -= loaded;

          const item = {
            eyeNumber: eye.number,
            capacity: eye.capacity,
            loaded,
            company: bestTask.company,
            dealer: bestTask.dealer,
            product: bestTask.product,
            densityKgPerL: bestTask.densityKgPerL,
            color:
              PRODUCT_COLORS[bestTask.product] || "#64748B",
          };

          allocations.push(item);
          bestTask.allocations.push(item);
        });

        bestTask.remaining = remaining;

        const usedIds = new Set(
          selectedEyes.map((eye) => eye.id)
        );

        remainingEyes = remainingEyes.filter(
          (eye) => !usedIds.has(eye.id)
        );

        continue;
      }
    }

    selectedEyes.forEach((eye) => {
      const loaded =
        partialEye && eye.id === partialEye.id
          ? partialLiters
          : eye.capacity;

      const item = {
        eyeNumber: eye.number,
        capacity: eye.capacity,
        loaded,
        company: bestTask.company,
        dealer: bestTask.dealer,
        product: bestTask.product,
        densityKgPerL: bestTask.densityKgPerL,
        color:
          PRODUCT_COLORS[bestTask.product] || "#64748B",
      };

      allocations.push(item);
      bestTask.allocations.push(item);
    });

    bestTask.remaining = 0;

    const usedIds = new Set(
      selectedEyes.map((eye) => eye.id)
    );

    remainingEyes = remainingEyes.filter(
      (eye) => !usedIds.has(eye.id)
    );
  }

  const usedNumbers = new Set(
    allocations.map((item) => item.eyeNumber)
  );

  const emptyEyes = eyes.filter(
    (eye) => !usedNumbers.has(eye.number)
  );

  const totalDemand = tasks.reduce(
    (sum, task) => sum + task.demand,
    0
  );

  const totalLoaded = allocations.reduce(
    (sum, item) => sum + item.loaded,
    0
  );

  const totalMassKg = allocations.reduce(
    (sum, item) => sum + item.loaded * item.densityKgPerL,
    0
  );

  return {
    tasks,
    allocations: allocations.sort(
      (a, b) => a.eyeNumber - b.eyeNumber
    ),
    emptyEyes,
    totalDemand,
    totalLoaded,
    totalMassKg,
    unallocated: totalDemand - totalLoaded,
  };
}

export default function App() {
  const [vehicles, setVehicles] = useState([]);
  const [plate, setPlate] = useState("");
  const [trailerPlate, setTrailerPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("tractor_semitrailer");
  const [tareWeightText, setTareWeightText] = useState("");
  const [maxGrossWeightText, setMaxGrossWeightText] = useState("");
  const [eyes, setEyes] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [plan, setPlan] = useState(null);
  const [selectedCutTaskId, setSelectedCutTaskId] = useState("");
  const [cutSummary, setCutSummary] = useState(null);
  const [selectedPlate, setSelectedPlate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVehicles();

    // iPhone Safari'de klavye açıldığında yatay taşmayı engelle.
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const styleId = "tankerplan-mobile-viewport-fix";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          html, body, #root {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  async function loadVehicles() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) setVehicles(JSON.parse(saved));
    } catch (error) {
      Alert.alert("Hata", "Araç kayıtları okunamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function persistVehicles(nextVehicles) {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(nextVehicles)
      );
      setVehicles(nextVehicles);
      return true;
    } catch (error) {
      Alert.alert("Hata", "Kayıt telefon hafızasına yazılamadı.");
      return false;
    }
  }

  function newVehicle() {
    setPlate("");
    setTrailerPlate("");
    setVehicleType("tractor_semitrailer");
    setTareWeightText("");
    setMaxGrossWeightText("");
    setSelectedPlate("");
    setEyes([]);
    setDealers([]);
    setPlan(null);
  }

  function addEye() {
    if (eyes.length >= 16) {
      Alert.alert(
        "Bilgi",
        "Bir tankere en fazla 16 göz eklenebilir."
      );
      return;
    }

    setEyes((previous) => [
      ...previous,
      {
        id: makeId(),
        number: previous.length + 1,
        capacity: 0,
        capacityText: "",
      },
    ]);

    setPlan(null);
  }

  function updateEye(id, value) {
    const capacity = parseLiters(value);

    setEyes((previous) =>
      previous.map((eye) =>
        eye.id === id
          ? { ...eye, capacity, capacityText: value }
          : eye
      )
    );

    setPlan(null);
  }

  function removeEye(id) {
    setEyes((previous) =>
      previous
        .filter((eye) => eye.id !== id)
        .map((eye, index) => ({
          ...eye,
          number: index + 1,
        }))
    );

    setPlan(null);
  }

  async function saveVehicle() {
    const normalized = normalizePlate(plate);

    if (!normalized) {
      Alert.alert("Eksik bilgi", vehicleType === "tractor_semitrailer" ? "Çekici plakasını girin." : "Kamyon plakasını girin.");
      return;
    }

    const normalizedTrailer = normalizePlate(trailerPlate);
    if (vehicleType === "tractor_semitrailer" && !normalizedTrailer) {
      Alert.alert("Eksik bilgi", "Yarı römork plakasını girin.");
      return;
    }

    const tareWeightKg = parseWeightKg(tareWeightText);
    const maxGrossWeightKg = parseWeightKg(maxGrossWeightText);
    if (tareWeightKg <= 0 || maxGrossWeightKg <= tareWeightKg) {
      Alert.alert("Eksik bilgi", "Boş ağırlığı ve ruhsattaki azami yüklü ağırlığı doğru girin.");
      return;
    }

    if (!eyes.length) {
      Alert.alert("Eksik bilgi", "En az bir tanker gözü ekleyin.");
      return;
    }

    if (eyes.some((eye) => eye.capacity <= 0)) {
      Alert.alert(
        "Eksik bilgi",
        "Bütün gözlerin kapasitesini girin."
      );
      return;
    }

    const existing = vehicles.find(
      (vehicle) => vehicle.plate === normalized
    );

    const record = {
      id: existing?.id || makeId(),
      plate: normalized,
      trailerPlate: vehicleType === "tractor_semitrailer" ? normalizedTrailer : "",
      vehicleType,
      tareWeightKg,
      maxGrossWeightKg,
      eyes: eyes.map((eye, index) => ({
        id: eye.id,
        number: index + 1,
        capacity: eye.capacity,
        capacityText: String(eye.capacity),
      })),
      updatedAt: new Date().toISOString(),
    };

    const next = [
      record,
      ...vehicles.filter(
        (vehicle) => vehicle.plate !== normalized
      ),
    ];

    const success = await persistVehicles(next);

    if (success) {
      setPlate(normalized);
      setSelectedPlate(normalized);

      Alert.alert(
        "Kaydedildi",
        `${normalized} plakalı araç kaydedildi.`
      );
    }
  }

  function selectVehicle(vehicle) {
    setPlate(vehicle.plate);
    setTrailerPlate(vehicle.trailerPlate || "");
    setVehicleType(vehicle.vehicleType || "tractor_semitrailer");
    setTareWeightText(vehicle.tareWeightKg ? String(vehicle.tareWeightKg) : "");
    setMaxGrossWeightText(vehicle.maxGrossWeightKg ? String(vehicle.maxGrossWeightKg) : "");
    setSelectedPlate(vehicle.plate);

    setEyes(
      vehicle.eyes.map((eye, index) => ({
        ...eye,
        number: index + 1,
        capacityText: String(eye.capacity),
      }))
    );

    setDealers([]);
    setPlan(null);
  }

async function deleteVehicle(vehicle) {
  const confirmDelete = async () => {
    try {
      const next = vehicles.filter(
        (item) => item.id !== vehicle.id
      );

      setVehicles(next);
      await persistVehicles(next);

      if (selectedPlate === vehicle.plate) {
        newVehicle();
      }

      if (typeof window !== "undefined") {
        window.alert("Araç başarıyla silindi.");
      }
    } catch (error) {
      console.error("Araç silme hatası:", error);
      Alert.alert("Hata", "Araç silinemedi.");
    }
  };

  if (typeof window !== "undefined") {
    if (window.confirm(`${vehicle.plate} plakalı araç silinsin mi?`)) {
      await confirmDelete();
    }
    return;
  }


  Alert.alert(

    "Araç silinsin mi?",

    `${vehicle.plate} plakalı araç silinecek.`,

    [

      { text: "Vazgeç", style: "cancel" },

      {

        text: "Sil",

        style: "destructive",

        onPress: confirmDelete

      }

    ]

  );

}

  function addDealer() {
    if (!eyes.length) {
      Alert.alert("Önce tanker gözlerini ekleyin.");
      return;
    }

    if (dealers.length >= eyes.length) {
      Alert.alert(
        "Bayi sınırı",
        "Bayi kartı sayısı tanker gözü sayısını geçemez."
      );
      return;
    }

    setDealers((previous) => [
      ...previous,
      makeDealer(),
    ]);

    setPlan(null);
  }

  function changeCompany(dealerId, company) {
    setDealers((previous) =>
      previous.map((dealer) =>
        dealer.id === dealerId
          ? {
              ...dealer,
              company,
              products: CATALOG[company].map((product) => ({
                name: product,
                liters: "",
                densityKgPerL: DEFAULT_DENSITY(product),
              })),
            }
          : dealer
      )
    );

    setPlan(null);
  }

  function updateDealerName(dealerId, name) {
    setDealers((previous) =>
      previous.map((dealer) =>
        dealer.id === dealerId
          ? { ...dealer, name }
          : dealer
      )
    );

    setPlan(null);
  }

  function updateProduct(dealerId, productName, field, value) {
    setDealers((previous) =>
      previous.map((dealer) =>
        dealer.id === dealerId
          ? {
              ...dealer,
              products: dealer.products.map((product) =>
                product.name === productName
                  ? { ...product, [field]: value }
                  : product
              ),
            }
          : dealer
      )
    );

    setPlan(null);
  }

  function removeDealer(dealerId) {
    setDealers((previous) =>
      previous.filter((dealer) => dealer.id !== dealerId)
    );

    setPlan(null);
  }

  function calculatePlan() {
    if (!eyes.length) {
      Alert.alert("Eksik bilgi", "Tanker gözlerini ekleyin.");
      return;
    }

    if (eyes.some((eye) => eye.capacity <= 0)) {
      Alert.alert(
        "Eksik bilgi",
        "Göz kapasitelerini kontrol edin."
      );
      return;
    }

    const hasDemand = dealers.some((dealer) =>
      dealer.products.some(
        (product) => parseLiters(product.liters) > 0
      )
    );

    if (!hasDemand) {
      Alert.alert(
        "Eksik bilgi",
        "En az bir ürün için litre girin."
      );
      return;
    }

    setSelectedCutTaskId("");
    setCutSummary(null);
    setPlan(createLoadingPlan(eyes, dealers));
  }

  function applyPayloadCut() {
    const payloadKg = parseWeightKg(maxGrossWeightText) - parseWeightKg(tareWeightText);
    if (payloadKg <= 0 || !plan || plan.totalMassKg <= payloadKg) return;
    if (!selectedCutTaskId) {
      Alert.alert("Ürün seçin", "Kesinti yapılacak ürünü seçin.");
      return;
    }

    const selectedTask = plan.tasks.find((task) => task.id === selectedCutTaskId);
    if (!selectedTask) return;
    const dealerIndex = selectedTask.dealerIndex;
    const productIndex = selectedTask.productIndex;
    const density = Number(selectedTask.densityKgPerL) || Number(DEFAULT_DENSITY(selectedTask.product));
    if (parseLiters(dealers[dealerIndex]?.products[productIndex]?.liters) <= 0 || density <= 0) return;

    const nextDealers = dealers.map((dealer) => ({
      ...dealer,
      products: dealer.products.map((product) => ({ ...product })),
    }));
    let nextPlan = plan;
    let totalCutLiters = 0;

    // Yalnızca seçilen ürünü azalt; her adımda yükleme planını yeniden hesapla.
    for (let attempt = 0; attempt < 20 && nextPlan.totalMassKg > payloadKg; attempt++) {
      const excessKg = nextPlan.totalMassKg - payloadKg;
      const availableLiters = parseLiters(nextDealers[dealerIndex].products[productIndex].liters);
      const cutLiters = Math.min(availableLiters, Math.max(1, Math.ceil(excessKg / density)));
      if (cutLiters <= 0) break;
      nextDealers[dealerIndex].products[productIndex].liters = String(availableLiters - cutLiters);
      totalCutLiters += cutLiters;
      nextPlan = createLoadingPlan(eyes, nextDealers);
    }

    if (totalCutLiters <= 0) {
      Alert.alert("Kesinti yapılamadı", "Seçilen üründen azaltılabilecek yük bulunamadı.");
      return;
    }
    setDealers(nextDealers);
    setPlan(nextPlan);
    setCutSummary({ product: selectedTask.product, liters: totalCutLiters, withinLimit: nextPlan.totalMassKg <= payloadKg });
  }


  function getPlanReportHtml() {
    return createPlanReportHtml({
      plan,
      plate,
      trailerPlate,
      vehicleType,
      eyes,
    });
  }

  function openWebPlanReport() {
    const html = getPlanReportHtml().replace(
      "</style>",
      `
        .web-report-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; gap: 10px; padding: 12px; background: #102d45; }
        .web-report-toolbar button { border: 0; border-radius: 7px; padding: 11px 16px; color: #fff; background: #147b57; font-size: 14px; font-weight: 700; }
        @media print { .web-report-toolbar { display: none !important; } }
      </style>`
    ).replace(
      "<body>",
      `<body><div class="web-report-toolbar"><button onclick="window.print()">PDF OLARAK KAYDET / YAZDIR</button></div>`
    );

    // Açılır pencere doğrudan kullanıcı dokunuşu sırasında oluşturulur;
    // böylece iOS/Safari açılır pencere engeline takılma olasılığı azalır.
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      Alert.alert(
        "Rapor açılamadı",
        "Tarayıcı yeni pencereyi engelledi. TankerPlan'ı Safari'de açıp tekrar deneyin."
      );
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();

    // Yazdırma penceresi açılamazsa rapor yeni sekmede kalır;
    // üstteki düğme ile kullanıcı yeniden başlatabilir.
    window.setTimeout(() => {
      try {
        reportWindow.print();
      } catch (error) {
        console.warn("Otomatik yazdırma başlatılamadı:", error);
      }
    }, 700);
  }

  async function savePlanPdf() {
    if (!plan) return;
    try {
      const html = getPlanReportHtml();
      if (Platform.OS === "web") {
        openWebPlanReport();
        return;
      }

      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "TankerPlan PDF kaydet veya paylaş",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("PDF hazır", `PDF dosyası oluşturuldu: ${file.uri}`);
      }
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      Alert.alert("PDF oluşturulamadı", "Lütfen tekrar deneyin.");
    }
  }

  async function printPlan() {
    if (!plan) return;
    try {
      if (Platform.OS === "web") {
        openWebPlanReport();
        return;
      }
      await Print.printAsync({ html: getPlanReportHtml() });
    } catch (error) {
      console.error("Yazdırma hatası:", error);
      Alert.alert("Yazdırma açılamadı", "Cihazınızın yazdırma özelliğini kontrol edin.");
    }
  }

  const totalCapacity = eyes.reduce(
    (sum, eye) => sum + eye.capacity,
    0
  );

  const usedProducts = plan
    ? [...new Set(plan.allocations.map((item) => item.product))]
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandDrop}>●</Text>
            </View>
            <Text style={styles.logo}>Tanker<Text style={styles.logoAccent}>Plan</Text></Text>
          </View>
          <Text style={styles.subtitle}>
            Akaryakıt Tankeri Yükleme Planlayıcı
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            1. Araç ve Plaka Kayıtları
          </Text>

          <Text style={styles.label}>Araç cinsi</Text>
          <View style={styles.companyList}>
            {[
              { value: "tractor_semitrailer", label: "Çekici + Yarı Römork Tanker" },
              { value: "kamyon", label: "Kamyon / Kırkayak Tanker" },
            ].map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[styles.companyButton, vehicleType === item.value && styles.companyButtonActive]}
                onPress={() => setVehicleType(item.value)}
              >
                <Text style={[styles.companyText, vehicleType === item.value && styles.companyTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {vehicleType === "tractor_semitrailer" ? (
            <>
              <Text style={styles.label}>Çekici plakası</Text>
              <TextInput style={styles.input} value={plate} onChangeText={setPlate}
                placeholder="Örn. 61 ABC 123" autoCapitalize="characters" />
              <Text style={styles.label}>Yarı römork plakası</Text>
              <TextInput style={styles.input} value={trailerPlate} onChangeText={setTrailerPlate}
                placeholder="Örn. 61 D 4567" autoCapitalize="characters" />
            </>
          ) : (
            <>
              <Text style={styles.label}>Kamyon plakası</Text>
              <TextInput style={styles.input} value={plate} onChangeText={setPlate}
                placeholder="Örn. 61 ABC 123" autoCapitalize="characters" />
            </>
          )}

          <Text style={styles.label}>Boş ağırlık (kg)</Text>
          <TextInput style={styles.input} value={tareWeightText}
            onChangeText={setTareWeightText} keyboardType="decimal-pad"
            placeholder="Boş araç / kombinasyon ağırlığı" />
          <Text style={styles.label}>Azami yüklü ağırlık (kg)</Text>
          <TextInput style={styles.input} value={maxGrossWeightText}
            onChangeText={setMaxGrossWeightText} keyboardType="decimal-pad"
            placeholder="Ruhsattaki azami yüklü ağırlık" />
          <Text style={styles.muted}>
            Kullanılabilir ürün yükü: {maxGrossWeightText && tareWeightText && parseWeightKg(maxGrossWeightText) > parseWeightKg(tareWeightText)
              ? formatLiters(parseWeightKg(maxGrossWeightText) - parseWeightKg(tareWeightText)) + " kg"
              : "Ağırlık bilgilerini girin"}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={saveVehicle}
            >
              <Text style={styles.buttonText}>
                Araç ve Gözleri Kaydet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.grayButton}
              onPress={newVehicle}
            >
              <Text style={styles.buttonText}>Yeni Araç</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Kayıtlı araçlar</Text>

          {loading ? (
            <Text style={styles.muted}>
              Kayıtlar yükleniyor...
            </Text>
          ) : vehicles.length === 0 ? (
            <Text style={styles.muted}>
              Henüz kayıtlı araç yok.
            </Text>
          ) : (
            vehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleRow}>
                <TouchableOpacity
                  style={styles.vehicleSelect}
                  onPress={() => selectVehicle(vehicle)}
                >
                  <Text style={styles.vehiclePlate}>
                    {vehicle.vehicleType === "tractor_semitrailer"
                      ? `Çekici: ${vehicle.plate} · Yarı römork: ${vehicle.trailerPlate || "—"}`
                      : `Kamyon: ${vehicle.plate}`}
                  </Text>

                  <Text style={styles.muted}>
                    {vehicle.eyes.length} göz ·{" "}
                    {formatLiters(
                      vehicle.eyes.reduce(
                        (sum, eye) => sum + eye.capacity,
                        0
                      )
                    )}{" "}
                    litre
                  </Text>

                  {selectedPlate === vehicle.plate && (
                    <Text style={styles.selectedText}>
                      Seçili araç
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteVehicle(vehicle)}
                >
                  <Text style={styles.deleteText}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            2. Tanker Gözleri
          </Text>

          <Text style={styles.muted}>
            Gözleri tek tek ekleyin ve her birinin litre
            kapasitesini girin.
          </Text>

          {eyes.map((eye) => (
            <View key={eye.id} style={styles.eyeInputRow}>
              <View style={styles.eyeNumber}>
                <Text style={styles.eyeNumberText}>
                  {eye.number}. Göz
                </Text>
              </View>

              <TextInput
                style={styles.capacityInput}
                value={eye.capacityText}
                onChangeText={(value) =>
                  updateEye(eye.id, value)
                }
                keyboardType="number-pad"
                placeholder="Kapasite (L)"
              />

              <TouchableOpacity
                style={styles.removeEyeButton}
                onPress={() => removeEye(eye.id)}
              >
                <Text style={styles.deleteText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={styles.outlineButton}
            onPress={addEye}
          >
            <Text style={styles.outlineButtonText}>
              + Yeni Göz Ekle
            </Text>
          </TouchableOpacity>

          <View style={styles.totalBox}>
            <Text style={styles.totalText}>
              Toplam tanker kapasitesi:{" "}
              {formatLiters(totalCapacity)} L
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={saveVehicle}
          >
            <Text style={styles.buttonText}>
              Göz Değişikliklerini Kaydet
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            3. Bayi ve Ürün Talepleri
          </Text>

          <Text style={styles.muted}>
            Her bayi için ayrı kart açın. Aynı dağıtım
            şirketinden birden fazla bayi ekleyebilirsiniz.
          </Text>

          {dealers.map((dealer, index) => (
            <View key={dealer.id} style={styles.dealerCard}>
              <View style={styles.dealerHeader}>
                <Text style={styles.dealerTitle}>
                  Bayi {index + 1}
                </Text>

                <TouchableOpacity
                  onPress={() => removeDealer(dealer.id)}
                >
                  <Text style={styles.deleteText}>Kartı Sil</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>
                Dağıtım şirketi
              </Text>

              <View style={styles.companyList}>
                {COMPANIES.map((company) => (
                  <TouchableOpacity
                    key={company}
                    style={[
                      styles.companyButton,
                      dealer.company === company &&
                        styles.companyButtonActive,
                    ]}
                    onPress={() =>
                      changeCompany(dealer.id, company)
                    }
                  >
                    <Text
                      style={[
                        styles.companyText,
                        dealer.company === company &&
                          styles.companyTextActive,
                      ]}
                    >
                      {company}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>
                Bayi adı / kodu
              </Text>

              <TextInput
                style={styles.input}
                value={dealer.name}
                onChangeText={(value) =>
                  updateDealerName(dealer.id, value)
                }
                placeholder="Bayi adı veya kodu"
              />

              <Text style={styles.label}>
                Ürün talepleri (litre) ve litre kesafeti (kg/litre)
              </Text>
              <Text style={styles.densityNotice}>
                Kesafet değerleri yaklaşık varsayılandır. Gerçek sevkiyatta analiz belgesi veya ölçüm sertifikasındaki değeri girin.
              </Text>

              {dealer.products.map((product) => (
                <View
                  key={product.name}
                  style={styles.productRow}
                >
                  <View
                    style={[
                      styles.productColorDot,
                      {
                        backgroundColor:
                          PRODUCT_COLORS[product.name] ||
                          "#64748B",
                      },
                    ]}
                  />

                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>
                      {product.name}
                    </Text>
                    <TextInput
                      style={styles.densityInput}
                      value={String(product.densityKgPerL ?? DEFAULT_DENSITY(product.name))}
                      onChangeText={(value) =>
                        updateProduct(
                          dealer.id,
                          product.name,
                          "densityKgPerL",
                          value.replace(/[^0-9.,]/g, "").replace(",", ".")
                        )
                      }
                      keyboardType="decimal-pad"
                      placeholder="kg/litre"
                    />
                  </View>

                  <TextInput
                    style={styles.literInput}
                    value={product.liters}
                    onChangeText={(value) =>
                      updateProduct(
                        dealer.id,
                        product.name,
                        "liters",
                        value
                      )
                    }
                    keyboardType="number-pad"
                    placeholder="Litre"
                  />
                </View>
              ))}
            </View>
          ))}

          <TouchableOpacity
            style={styles.outlineButton}
            onPress={addDealer}
          >
            <Text style={styles.outlineButtonText}>
              + Yeni Bayi Ekle
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.calculateButton}
            onPress={calculatePlan}
          >
            <Text style={styles.buttonText}>
              YÜKLEME PLANINI OLUŞTUR
            </Text>
          </TouchableOpacity>
        </View>

        {plan && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              4. Yükleme Planı
            </Text>

            <View style={styles.exportButtons}>
              <TouchableOpacity
                style={styles.pdfButton}
                onPress={savePlanPdf}
              >
                <Text style={styles.buttonText}>PDF OLARAK KAYDET</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.printButton}
                onPress={printPlan}
              >
                <Text style={styles.buttonText}>YAZDIR</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>
                  Toplam talep
                </Text>
                <Text style={styles.summaryValue}>
                  {formatLiters(plan.totalDemand)} L
                </Text>
              </View>

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>
                  Yüklenecek
                </Text>
                <Text style={styles.summaryValue}>
                  {formatLiters(plan.totalLoaded)} L
                </Text>
              </View>

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>
                  Karşılanamayan
                </Text>
                <Text style={styles.summaryValue}>
                  {formatLiters(plan.unallocated)} L
                </Text>
              </View>
            </View>

            <View style={styles.massSummary}>
              <Text style={styles.massSummaryText}>
                Tahmini toplam ürün ağırlığı: {formatLiters(Math.round(plan.totalMassKg))} kg
              </Text>
              {parseWeightKg(tareWeightText) > 0 &&
              parseWeightKg(maxGrossWeightText) > parseWeightKg(tareWeightText) ? (
                <>
                  <Text style={styles.massSummaryText}>
                    Kullanılabilir ürün yükü: {formatLiters(parseWeightKg(maxGrossWeightText) - parseWeightKg(tareWeightText))} kg
                  </Text>
                  {plan.totalMassKg > parseWeightKg(maxGrossWeightText) - parseWeightKg(tareWeightText) ? (
                    <Text style={[styles.massSummaryText, { color: "#B91C1C", fontWeight: "bold" }]}>
                      UYARI: Tahmini ürün ağırlığı aracın kullanılabilir yük kapasitesini {formatLiters(Math.ceil(plan.totalMassKg - (parseWeightKg(maxGrossWeightText) - parseWeightKg(tareWeightText)) ))} kg aşıyor.
                    </Text>
                  ) : (
                    <Text style={[styles.massSummaryText, { color: "#166534" }]}>
                      Ürün ağırlığı girilen yük kapasitesinin içinde görünüyor.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.massSummaryText}>
                  Yük kapasitesi kontrolü için boş ağırlık ve azami yüklü ağırlık bilgilerini girip aracı kaydedin.
                </Text>
              )}
              <Text style={styles.muted}>
                Kesafetler ortalama değerlerdir. Bu kontrol tahminidir; dingil yükü ve gerçek tartım ayrıca kontrol edilmelidir.
              </Text>
            </View>

            {parseWeightKg(maxGrossWeightText) > parseWeightKg(tareWeightText) && plan.totalMassKg > parseWeightKg(maxGrossWeightText) - parseWeightKg(tareWeightText) && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>Kesinti yapılacak ürünü seçin</Text>
                <Text style={styles.warningText}>Yalnızca seçtiğiniz ürünün litre miktarı azaltılır; diğer ürünler korunur.</Text>
                {plan.tasks.filter((task) => task.allocations.length > 0).map((task) => (
                  <TouchableOpacity key={task.id}
                    style={[styles.companyButton, selectedCutTaskId === task.id && styles.companyButtonActive, { marginTop: 7, alignSelf: "flex-start" }]}
                    onPress={() => setSelectedCutTaskId(task.id)}>
                    <Text style={[styles.companyText, selectedCutTaskId === task.id && styles.companyTextActive]}>
                      {selectedCutTaskId === task.id ? "✓ " : ""}{task.product} · {task.dealer}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.calculateButton} onPress={applyPayloadCut}>
                  <Text style={styles.buttonText}>SEÇİLEN ÜRÜNDEN KESİNTİ YAP</Text>
                </TouchableOpacity>
              </View>
            )}

            {cutSummary && (
              <View style={cutSummary.withinLimit ? styles.massSummary : styles.warningBox}>
                <Text style={cutSummary.withinLimit ? styles.massSummaryText : styles.warningTitle}>
                  {cutSummary.product} ürününden {formatLiters(cutSummary.liters)} litre azaltıldı.
                  {cutSummary.withinLimit ? " Araç yük sınırına uygun." : " Hâlâ kapasite aşımı var; aynı üründen tekrar kesinti uygulayabilirsiniz."}
                </Text>
              </View>
            )}

            <Text style={styles.subTitle}>
              Ürün renk anahtarı
            </Text>

            <View style={styles.legendGrid}>
              {usedProducts.map((product) => (
                <View
                  key={product}
                  style={styles.legendItem}
                >
                  <View
                    style={[
                      styles.legendDot,
                      {
                        backgroundColor:
                          PRODUCT_COLORS[product] ||
                          "#64748B",
                      },
                    ]}
                  />

                  <Text style={styles.legendText}>
                    {product}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.subTitle}>
              Tanker göz dolum şeması
            </Text>

            <View style={styles.tankGrid}>
              {eyes.map((eye) => {
                const allocation = plan.allocations.find(
                  (item) => item.eyeNumber === eye.number
                );

                const percentage =
                  allocation && eye.capacity > 0
                    ? Math.min(
                        100,
                        (allocation.loaded / eye.capacity) * 100
                      )
                    : 0;

                return (
                  <View
                    key={eye.id}
                    style={styles.tankEye}
                  >
                    <Text style={styles.tankEyeTitle}>
                      {eye.number}. Göz
                    </Text>

                    <View style={styles.tankOuter}>
                      <View
                        style={[
                          styles.tankFill,
                          {
                            height: `${percentage}%`,
                            backgroundColor: allocation
                              ? allocation.color
                              : "#dce3e8",
                          },
                        ]}
                      />
                    </View>

                    <Text style={styles.tankLiters}>
                      {formatLiters(
                        allocation?.loaded || 0
                      )}{" "}
                      L
                    </Text>

                    <Text style={styles.tankCapacity}>
                      / {formatLiters(eye.capacity)} L
                    </Text>

                    {allocation ? (
                      <Text style={styles.tankProduct}>
                        {allocation.product}
                      </Text>
                    ) : (
                      <Text style={styles.emptyText}>
                        Boş
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            <Text style={styles.subTitle}>
              Göz bazında yükleme listesi
            </Text>

            {plan.allocations.map((item) => (
              <View
                key={`allocation-${item.eyeNumber}`}
                style={styles.resultRow}
              >
                <View
                  style={[
                    styles.resultEye,
                    { backgroundColor: item.color },
                  ]}
                >
                  <Text style={styles.resultEyeText}>
                    {item.eyeNumber}. Göz
                  </Text>
                </View>

                <View style={styles.resultDetails}>
                  <Text style={styles.resultProduct}>
                    {item.product}
                  </Text>

                  <Text style={styles.muted}>
                    {item.company} · {item.dealer}
                  </Text>

                  <Text style={styles.resultLiters}>
                    {formatLiters(item.loaded)} L / {formatLiters(item.capacity)} L
                  </Text>
                  <Text style={styles.muted}>
                    Litre kesafeti: {item.densityKgPerL} kg/litre · Yaklaşık ağırlık: {formatLiters(Math.round(item.loaded * item.densityKgPerL))} kg
                  </Text>
                </View>
              </View>
            ))}

            {plan.emptyEyes.length > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>
                  Boş kalan gözler
                </Text>

                <Text style={styles.warningText}>
                  {plan.emptyEyes
                    .map((eye) => `${eye.number}. Göz`)
                    .join(", ")}
                </Text>
              </View>
            )}

            {plan.tasks.some(
              (task) => task.remaining > 0
            ) && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>
                  Karşılanamayan ürün talepleri
                </Text>

                {plan.tasks
                  .filter((task) => task.remaining > 0)
                  .map((task) => (
                    <Text
                      key={task.id}
                      style={styles.warningText}
                    >
                      {task.dealer} · {task.product}:{" "}
                      {formatLiters(task.remaining)} L eksik
                    </Text>
                  ))}
              </View>
            )}

            <Text style={styles.note}>
              Not: Kesafet değerleri yaklaşık varsayılandır; ağırlık hesabı tahminidir. Gerçek sevkiyat için analiz belgesi/ölçüm sertifikasındaki değer kullanılmalıdır. Her göz yalnızca tek ürün taşır. Renkler ürünleri
              ayırt etmek içindir. Kısmi dolacak göz için mümkünse
              tanker merkezine yakın göz tercih edilir. Yükleme
              algoritması kapasite eşleşmesini önceliklendirir;
              bütün ürünler için küresel optimum garantisi vermez.
            </Text>
          </View>
        )}

        <Text style={styles.footer}>
          TANKERPLAN · Tasarım ve Geliştirme: Halim Pirselimoğlu
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "#eef2f5",
    overflow: "hidden",
  },
  container: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    padding: 14,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: "#102d45",
    padding: 22,
    borderRadius: 16,
    marginBottom: 14,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#e11d2e",
  },
  brandDrop: {
    color: "#e11d2e",
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 29,
  },
  logo: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  logoAccent: {
    color: "#ef3340",
  },
  subtitle: {
    color: "#c6d6e2",
    marginTop: 5,
    fontSize: 13,
  },
  card: {
    width: "100%",
    minWidth: 0,
    backgroundColor: "#ffffff",
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17364d",
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#17364d",
    marginTop: 18,
    marginBottom: 10,
  },
  label: {
    color: "#536574",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d5dfe6",
    borderRadius: 9,
    padding: 12,
    fontSize: 16,
    color: "#172b3a",
    backgroundColor: "#fbfcfd",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#147b57",
    padding: 13,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 10,
  },
  grayButton: {
    backgroundColor: "#647684",
    padding: 13,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  muted: {
    color: "#7b8b96",
    fontSize: 12,
    marginTop: 3,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e7ec",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  vehicleSelect: {
    flex: 1,
  },
  vehiclePlate: {
    color: "#18364d",
    fontSize: 16,
    fontWeight: "800",
  },
  selectedText: {
    color: "#147b57",
    fontWeight: "800",
    fontSize: 12,
    marginTop: 3,
  },
  deleteButton: {
    padding: 9,
  },
  deleteText: {
    color: "#c0392b",
    fontWeight: "800",
  },
  eyeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 9,
  },
  eyeNumber: {
    width: 72,
    backgroundColor: "#eaf0f4",
    padding: 11,
    borderRadius: 8,
    alignItems: "center",
  },
  eyeNumberText: {
    fontWeight: "800",
    color: "#24445b",
    fontSize: 12,
  },
  capacityInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d5dfe6",
    padding: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  removeEyeButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#147b57",
    borderRadius: 9,
    padding: 13,
    alignItems: "center",
    marginTop: 13,
  },
  outlineButtonText: {
    color: "#147b57",
    fontWeight: "800",
  },
  totalBox: {
    backgroundColor: "#edf5f1",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  totalText: {
    color: "#147b57",
    fontWeight: "800",
    textAlign: "center",
  },
  dealerCard: {
    borderWidth: 1,
    borderColor: "#dce5eb",
    borderRadius: 11,
    padding: 12,
    marginTop: 12,
  },
  dealerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dealerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#17364d",
  },
  companyList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  companyButton: {
    borderWidth: 1,
    borderColor: "#d4dfe6",
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  companyButtonActive: {
    backgroundColor: "#173e59",
    borderColor: "#173e59",
  },
  companyText: {
    color: "#526675",
    fontSize: 11,
    fontWeight: "700",
  },
  companyTextActive: {
    color: "#ffffff",
  },
  productRow: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f4",
    paddingVertical: 9,
    gap: 8,
  },
  productColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  productName: {
    flex: 1,
    color: "#334c5d",
    fontSize: 13,
    fontWeight: "600",
  },
  densityNotice: {
    color: "#98621d",
    backgroundColor: "#fff7e8",
    borderRadius: 7,
    padding: 8,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  densityInput: {
    width: 88,
    borderWidth: 1,
    borderColor: "#d5dfe6",
    borderRadius: 7,
    padding: 7,
    fontSize: 16,
    color: "#334c5d",
  },
  massSummary: {
    backgroundColor: "#edf5f1",
    borderRadius: 9,
    padding: 12,
    marginTop: 12,
  },
  massSummaryText: {
    color: "#147b57",
    fontWeight: "800",
    textAlign: "center",
  },
  literInput: {
    width: 95,
    borderWidth: 1,
    borderColor: "#d5dfe6",
    borderRadius: 7,
    padding: 9,
    textAlign: "right",
    fontSize: 16,
  },
  calculateButton: {
    backgroundColor: "#173e59",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  exportButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  pdfButton: {
    flex: 1,
    minWidth: 145,
    backgroundColor: "#147b57",
    borderRadius: 9,
    padding: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  printButton: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#173e59",
    borderRadius: 9,
    padding: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0,
    gap: 7,
  },
  summaryItem: {
    flex: 1,
    minWidth: 88,
    backgroundColor: "#edf2f5",
    borderRadius: 9,
    padding: 9,
  },
  summaryLabel: {
    color: "#647684",
    fontSize: 10,
    fontWeight: "700",
  },
  summaryValue: {
    color: "#17364d",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 5,
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "47%",
    gap: 6,
  },
  legendDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
  },
  legendText: {
    flex: 1,
    color: "#435967",
    fontSize: 11,
  },
  tankGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0,
    gap: 9,
  },
  tankEye: {
    width: "22%",
    minWidth: 62,
    alignItems: "center",
    backgroundColor: "#f4f7f9",
    borderRadius: 9,
    padding: 7,
  },
  tankEyeTitle: {
    color: "#24445b",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 6,
  },
  tankOuter: {
    height: 82,
    width: 38,
    borderWidth: 2,
    borderColor: "#9aabb7",
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#ffffff",
  },
  tankFill: {
    width: "100%",
  },
  tankLiters: {
    fontSize: 11,
    color: "#17364d",
    fontWeight: "800",
    marginTop: 6,
  },
  tankCapacity: {
    color: "#71818c",
    fontSize: 9,
  },
  tankProduct: {
    color: "#334c5d",
    fontSize: 9,
    textAlign: "center",
    marginTop: 4,
  },
  emptyText: {
    color: "#8a969e",
    fontSize: 10,
    marginTop: 4,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f4",
    paddingVertical: 10,
    gap: 10,
  },
  resultEye: {
    width: 65,
    borderRadius: 7,
    padding: 9,
  },
  resultEyeText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 11,
    textAlign: "center",
  },
  resultDetails: {
    flex: 1,
    minWidth: 0,
  },
  resultProduct: {
    color: "#17364d",
    fontWeight: "800",
    fontSize: 13,
    flexShrink: 1,
  },
  resultLiters: {
    color: "#147b57",
    fontWeight: "800",
    marginTop: 4,
    fontSize: 12,
  },
  warningBox: {
    backgroundColor: "#fff5e8",
    borderRadius: 9,
    padding: 12,
    marginTop: 12,
  },
  warningTitle: {
    color: "#a65c12",
    fontWeight: "800",
    marginBottom: 5,
  },
  warningText: {
    color: "#86551e",
    fontSize: 12,
    marginTop: 3,
  },
  note: {
    color: "#788894",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14,
  },
  footer: {
    textAlign: "center",
    color: "#8796a0",
    fontSize: 11,
    marginVertical: 10,
  },
});

if (typeof document !== "undefined" && "serviceWorker" in navigator) {

  const registerSW = () => {

    navigator.serviceWorker.register("/sw.js")

      .then(() => console.log("TankerPlan çevrimdışı hazır"))

      .catch((error) => console.error("SW hatası:", error));

  };

  if (document.readyState === "complete") {

    registerSW();

  } else {

    window.addEventListener("load", registerSW);

  }

}