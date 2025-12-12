// src/NationalTaxService.js
import React, { useState, useEffect, useCallback } from "react";
import { db, getCachedDocument, invalidateCache } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { usePolling } from "./hooks/usePolling";
import { formatKoreanCurrency } from "./numberFormatter";

const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "유효하지 않은 날짜";
  return date.toLocaleString("ko-KR");
};

const DEFAULT_TREASURY_DATA = {
  totalAmount: 0,
  stockTaxRevenue: 0,
  stockCommissionRevenue: 0,
  realEstateTransactionTaxRevenue: 0,
  vatRevenue: 0,
  auctionTaxRevenue: 0,
  propertyHoldingTaxRevenue: 0,
  itemMarketTaxRevenue: 0,
  incomeTaxRevenue: 0,
  corporateTaxRevenue: 0,
  otherTaxRevenue: 0,
  lastUpdated: null,
};

const DEFAULT_TAX_SETTINGS = {
  stockTransactionTaxRate: 0.01,
  realEstateTransactionTaxRate: 0.03,
  itemStoreVATRate: 0.1,
  auctionTransactionTaxRate: 0.03,
  propertyHoldingTaxRate: 0.002,
  propertyHoldingTaxInterval: "weekly",
  itemMarketTransactionTaxRate: 0.03,
  lastUpdated: null,
};

const NationalTaxService = ({ classCode }) => {
  const [treasuryData, setTreasuryData] = useState(DEFAULT_TREASURY_DATA);
  const [taxSettings, setTaxSettings] = useState(DEFAULT_TAX_SETTINGS);
  const [loadingTreasury, setLoadingTreasury] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [editableSettings, setEditableSettings] = useState(DEFAULT_TAX_SETTINGS);

  const fetchTreasuryData = useCallback(async () => {
    if (!classCode) {
      setLoadingTreasury(false);
      setTreasuryData(DEFAULT_TREASURY_DATA);
      return;
    }
    setLoadingTreasury(true);
    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    try {
      const cached = await getCachedDocument("nationalTreasuries", classCode, 5 * 60 * 1000);
      if (cached) {
        setTreasuryData({ ...DEFAULT_TREASURY_DATA, ...cached });
        setLoadingTreasury(false);
        return;
      }

      const docSnap = await getDoc(treasuryRef);
      if (docSnap.exists()) {
        setTreasuryData({ ...DEFAULT_TREASURY_DATA, ...docSnap.data() });
        invalidateCache(`doc_nationalTreasuries_${classCode}`);
      } else {
        await setDoc(treasuryRef, {
          ...DEFAULT_TREASURY_DATA,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        invalidateCache(`doc_nationalTreasuries_${classCode}`);
        setTreasuryData({
          ...DEFAULT_TREASURY_DATA,
          lastUpdated: new Date(),
        });
      }
      setLoadingTreasury(false);
    } catch (error) {
      console.error(`[${classCode}] 국고 데이터 로드 실패:`, error);
      setLoadingTreasury(false);
    }
  }, [classCode]);

  const { refetch: refetchTreasury } = usePolling(fetchTreasuryData, { interval: 300000, enabled: !!classCode });

  const fetchTaxSettings = useCallback(async () => {
    if (!classCode) {
      setLoadingSettings(false);
      setTaxSettings(DEFAULT_TAX_SETTINGS);
      setEditableSettings(DEFAULT_TAX_SETTINGS);
      return;
    }
    setLoadingSettings(true);
    const settingsRef = doc(db, "governmentSettings", classCode);
    try {
      const cached = await getCachedDocument("governmentSettings", classCode, 5 * 60 * 1000);
      if (cached?.taxSettings) {
        const newSettings = { ...DEFAULT_TAX_SETTINGS, ...cached.taxSettings };
        setTaxSettings(newSettings);
        setEditableSettings(newSettings);
        setLoadingSettings(false);
        return;
      }

      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists() && docSnap.data().taxSettings) {
        const newSettings = { ...DEFAULT_TAX_SETTINGS, ...docSnap.data().taxSettings };
        setTaxSettings(newSettings);
        setEditableSettings(newSettings);
        invalidateCache(`doc_governmentSettings_${classCode}`);
      } else {
        await setDoc(settingsRef, {
          taxSettings: {
            ...DEFAULT_TAX_SETTINGS,
            lastUpdated: serverTimestamp(),
          },
        }, { merge: true });
        invalidateCache(`doc_governmentSettings_${classCode}`);
        setTaxSettings(DEFAULT_TAX_SETTINGS);
        setEditableSettings(DEFAULT_TAX_SETTINGS);
      }
      setLoadingSettings(false);
    } catch (error) {
      console.error(`[${classCode}] 세금 정책 로드 실패:`, error);
      setLoadingSettings(false);
    }
  }, [classCode]);

  const { refetch: refetchSettings } = usePolling(fetchTaxSettings, { interval: 300000, enabled: !!classCode });

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    const numericValue = value === "" ? "" : parseFloat(value);
    setEditableSettings((prev) => ({
      ...prev,
      [name]: numericValue,
    }));
  };

  const handleIntervalChange = (e) => {
    const { name, value } = e.target;
    setEditableSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const saveTaxSettings = async () => {
    if (!classCode) return;
    for (const key in editableSettings) {
      if (
        key.endsWith("Rate") &&
        (editableSettings[key] < 0 || editableSettings[key] > 1)
      ) {
        if (
          editableSettings[key] !== "" &&
          !(key === "itemStoreVATRate" && editableSettings[key] > 1)
        ) {
          alert(
            `${key} 세율은 0과 1 사이의 값이어야 합니다 (예: 3%는 0.03). 현재값: ${editableSettings[key]}`
          );
          return;
        }
      }
    }

    const settingsRef = doc(db, "governmentSettings", classCode);
    try {
      await updateDoc(settingsRef, {
        taxSettings: {
          ...editableSettings,
          lastUpdated: serverTimestamp(),
        },
      });
      refetchSettings();
      alert("세금 정책이 성공적으로 업데이트되었습니다.");
    } catch (error) {
      console.error("세금 정책 업데이트 실패:", error);
      alert("세금 정책 업데이트 중 오류가 발생했습니다.");
    }
  };

  if (!classCode) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-slate-800 mb-2">학급 코드가 필요합니다</h2>
        <p className="text-slate-500">
          정부 메뉴에서 국세청 기능을 사용하려면 학급에 먼저 참여해야 합니다.
        </p>
      </div>
    );
  }

  if (loadingTreasury || loadingSettings) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">국세청 데이터를 불러오는 중 (학급: {classCode})...</p>
        </div>
      </div>
    );
  }

  const totalTaxRevenue = Object.keys(treasuryData)
    .filter((key) => key.endsWith("Revenue") && key !== "totalAmount")
    .reduce((sum, key) => sum + (treasuryData[key] || 0), 0);

  const taxPolicyFields = [
    { name: "stockTransactionTaxRate", label: "주식 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
    { name: "realEstateTransactionTaxRate", label: "부동산 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
    { name: "itemStoreVATRate", label: "아이템 상점 부가세율", type: "number", step: "0.01", min: "0", max: "1" },
    { name: "auctionTransactionTaxRate", label: "경매장 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
    { name: "propertyHoldingTaxRate", label: "부동산 보유세율", type: "number", step: "0.0001", min: "0", max: "1" },
    { name: "propertyHoldingTaxInterval", label: "부동산 보유세 징수 주기", type: "select", options: ["daily", "weekly", "monthly"] },
    { name: "itemMarketTransactionTaxRate", label: "아이템 시장 거래세율", type: "number", step: "0.001", min: "0", max: "1" },
  ];

  const tabs = [
    { id: "overview", label: "개요", icon: "📊" },
    { id: "revenue", label: "세수 현황", icon: "💰" },
    { id: "policy", label: "세금 정책", icon: "📋" },
    { id: "analytics", label: "분석", icon: "📈" },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-3xl font-bold mb-2">🏛️ {classCode} 학급 국세청</h1>
        <p className="text-white/80 text-lg">세금 정책 관리 및 국고 운영</p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-t-xl font-bold text-sm transition-all ${activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-lg"
                : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* 개요 탭 */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 총 국고 */}
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg border border-emerald-400/30">
              <p className="text-emerald-100 text-sm font-medium mb-1">💰 총 국고</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.totalAmount)}</p>
            </div>

            {/* 주식 거래세 수입 */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg border border-blue-400/30">
              <p className="text-blue-100 text-sm font-medium mb-1">📈 주식 거래세 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.stockTaxRevenue)}</p>
            </div>

            {/* 주식 거래 수수료 수입 */}
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg border border-indigo-400/30">
              <p className="text-indigo-100 text-sm font-medium mb-1">📊 주식 거래 수수료 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.stockCommissionRevenue)}</p>
            </div>

            {/* 부동산 거래세 수입 */}
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg border border-amber-400/30">
              <p className="text-amber-100 text-sm font-medium mb-1">🏠 부동산 거래세 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.realEstateTransactionTaxRevenue)}</p>
            </div>

            {/* 아이템 부가세 수입 */}
            <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg border border-pink-400/30">
              <p className="text-pink-100 text-sm font-medium mb-1">🛒 아이템 부가세 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.vatRevenue)}</p>
            </div>

            {/* 경매장 거래세 수입 */}
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl p-6 text-white shadow-lg border border-cyan-400/30">
              <p className="text-cyan-100 text-sm font-medium mb-1">🔨 경매장 거래세 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.auctionTaxRevenue)}</p>
            </div>

            {/* 부동산 보유세 수입 */}
            <div className="bg-gradient-to-br from-lime-500 to-lime-600 rounded-2xl p-6 text-white shadow-lg border border-lime-400/30">
              <p className="text-lime-100 text-sm font-medium mb-1">🏘️ 부동산 보유세 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.propertyHoldingTaxRevenue)}</p>
            </div>

            {/* 아이템 시장 거래세 수입 */}
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg border border-orange-400/30">
              <p className="text-orange-100 text-sm font-medium mb-1">🏪 아이템 시장 거래세 수입</p>
              <p className="text-2xl font-bold text-shadow-sm">{formatKoreanCurrency(treasuryData.itemMarketTaxRevenue)}</p>
            </div>
          </div>

          {/* 최근 업데이트 */}
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-[#00fff2]/30 shadow-lg shadow-[#00fff2]/5">
            <h3 className="text-lg font-bold text-[#00fff2] mb-4">📅 최근 업데이트</h3>
            <div className="space-y-2 text-slate-300">
              <p>국고 마지막 업데이트: <span className="font-medium text-white">{formatDate(treasuryData.lastUpdated)}</span></p>
              <p>세금 정책 마지막 업데이트: <span className="font-medium text-white">{formatDate(taxSettings.lastUpdated)}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* 세수 현황 탭 */}
      {activeTab === "revenue" && (
        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-[#00fff2]/30 shadow-lg shadow-[#00fff2]/5">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-[#00fff2]">💰 세수 현황 분석</h3>
            <div className="text-right">
              <p className="text-sm text-slate-400">세수 총합</p>
              <p className="text-2xl font-bold text-white text-shadow-sm">{formatKoreanCurrency(totalTaxRevenue)}</p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: "주식 거래세", amount: treasuryData.stockTaxRevenue, color: "bg-blue-500" },
              { label: "주식 수수료", amount: treasuryData.stockCommissionRevenue, color: "bg-indigo-500" },
              { label: "부동산 거래세", amount: treasuryData.realEstateTransactionTaxRevenue, color: "bg-amber-500" },
              { label: "부가세", amount: treasuryData.vatRevenue, color: "bg-pink-500" },
              { label: "경매장 거래세", amount: treasuryData.auctionTaxRevenue, color: "bg-cyan-500" },
              { label: "부동산 보유세", amount: treasuryData.propertyHoldingTaxRevenue, color: "bg-lime-500" },
              { label: "아이템 시장세", amount: treasuryData.itemMarketTaxRevenue, color: "bg-orange-500" },
            ].map((item) => {
              const percentage = totalTaxRevenue > 0 ? ((item.amount / totalTaxRevenue) * 100).toFixed(1) : "0.0";
              return (
                <div key={item.label} className="flex items-center gap-4">
                  <div className="w-32 font-medium text-slate-300">{item.label}</div>
                  <div className="flex-1 h-6 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div
                      className={`h-full ${item.color} transition-all duration-500 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-40 text-right text-sm">
                    <span className="font-bold text-white">{formatKoreanCurrency(item.amount)}</span>
                    <span className="text-slate-400 ml-2">({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 세금 정책 탭 */}
      {activeTab === "policy" && (
        <div className="space-y-6">
          <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-[#00fff2]/30 shadow-lg shadow-[#00fff2]/5">
            <h3 className="text-xl font-bold text-[#00fff2] mb-6">📋 현행 세금 정책 (학급: {classCode})</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {taxPolicyFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-bold text-slate-300 mb-2">
                    {field.label}
                    <span className="text-[#00fff2] font-normal ml-2">
                      (현재: {field.type === "select"
                        ? taxSettings[field.name]
                        : `${((taxSettings[field.name] || 0) * 100).toFixed(field.name.includes("propertyHoldingTaxRate") ? 2 : 1)}%`})
                    </span>
                  </label>
                  {field.type === "select" ? (
                    <select
                      name={field.name}
                      value={editableSettings[field.name] || DEFAULT_TAX_SETTINGS[field.name]}
                      onChange={handleIntervalChange}
                      className="w-full px-4 py-3 bg-[#13131f] border-2 border-slate-700 rounded-xl focus:outline-none focus:border-[#00fff2] text-white transition-colors"
                    >
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "daily" ? "매일" : opt === "weekly" ? "매주" : "매월"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      name={field.name}
                      value={editableSettings[field.name] === "" ? "" : editableSettings[field.name]}
                      onChange={handleSettingChange}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      placeholder={`예: ${field.label.includes("부가") ? "0.1 (10%)" : "0.03 (3%)"}`}
                      className="w-full px-4 py-3 bg-[#13131f] border-2 border-slate-700 rounded-xl focus:outline-none focus:border-[#00fff2] text-white transition-colors placeholder-slate-600"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={saveTaxSettings}
              className="mt-6 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold transition-all shadow-lg border border-indigo-400/30"
            >
              세금 정책 저장
            </button>
          </div>

          <div className="bg-[#13131f] rounded-2xl p-6 border border-blue-500/30 shadow-lg">
            <h3 className="text-lg font-bold text-blue-400 mb-3">💡 세금 정책 목표</h3>
            <ul className="text-blue-300 space-y-2">
              <li>• 공정한 시장 경제 질서 확립</li>
              <li>• 안정적인 학급 재정 정보 및 공공 서비스 투자</li>
              <li>• 경제 활동 참여와 감의 형평성 제고</li>
            </ul>
          </div>
        </div>
      )}

      {/* 분석 탭 */}
      {activeTab === "analytics" && (
        <div className="bg-[#1a1a2e] rounded-2xl p-6 border border-[#00fff2]/30 shadow-lg">
          <h3 className="text-xl font-bold text-[#00fff2] mb-4">📈 세수 분석 (학급: {classCode})</h3>
          <div className="bg-[#13131f] rounded-xl p-8 text-center border border-slate-700">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-slate-300">추후 다양한 세수 분석 차트와 상세 정보가 표시될 예정입니다.</p>
            <p className="text-slate-500 text-sm mt-2">예: 시간에 따른 세수 변화, 카테고리별 기여도 등</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NationalTaxService;
