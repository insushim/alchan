// src/NationalTaxService.js
import React, { useState, useEffect, useCallback } from "react";
import { db, getCachedDocument, invalidateCache } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment, // 援?퀬 ?낅뜲?댄듃 ???ъ슜
} from "firebase/firestore";
import { usePolling } from "./hooks/usePolling";

import { formatKoreanCurrency } from "./numberFormatter";

const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "?좏슚?섏? ?딆? ?좎쭨";
  return date.toLocaleString("ko-KR");
};

// [?섏젙] 湲곕낯 援?퀬 ?곗씠?곗뿉 stockCommissionRevenue 異붽?
const DEFAULT_TREASURY_DATA = {
  totalAmount: 0,
  stockTaxRevenue: 0,
  stockCommissionRevenue: 0, // 二쇱떇 嫄곕옒 ?섏닔猷??섏엯
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

// 湲곕낯 ?멸툑 ?뺤콉 ?ㅼ젙 (Firestore???놁쓣 寃쎌슦 ?ъ슜??珥덇린媛?
const DEFAULT_TAX_SETTINGS = {
  stockTransactionTaxRate: 0.01, // 二쇱떇 嫄곕옒?몄쑉 (1%)
  realEstateTransactionTaxRate: 0.03, // 遺?숈궛 嫄곕옒?몄쑉 (3%)
  itemStoreVATRate: 0.1, // ?꾩씠???곸젏 遺媛媛移섏꽭??(10%)
  auctionTransactionTaxRate: 0.03, // 寃쎈ℓ??嫄곕옒?몄쑉 (3%)
  propertyHoldingTaxRate: 0.002, // 遺?숈궛 蹂댁쑀?몄쑉 (0.2%)
  propertyHoldingTaxInterval: "weekly", // 遺?숈궛 蹂댁쑀??吏뺤닔 二쇨린 (?? weekly, monthly)
  itemMarketTransactionTaxRate: 0.03, // ?꾩씠???쒖옣 嫄곕옒?몄쑉 (3%)
  lastUpdated: null,
};

const NationalTaxService = ({ classCode }) => {
  const [treasuryData, setTreasuryData] = useState(DEFAULT_TREASURY_DATA);
  const [taxSettings, setTaxSettings] = useState(DEFAULT_TAX_SETTINGS);
  const [loadingTreasury, setLoadingTreasury] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [editableSettings, setEditableSettings] =
    useState(DEFAULT_TAX_SETTINGS);

  // 援?퀬 ?곗씠???대쭅 (classCode 湲곕컲)
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

  const { refetch: refetchTreasury } = usePolling(fetchTreasuryData, { interval: 30000, enabled: !!classCode });

  // ?멸툑 ?뺤콉 ?ㅼ젙 ?대쭅 (classCode 湲곕컲)
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

  const { refetch: refetchSettings } = usePolling(fetchTaxSettings, { interval: 30000, enabled: !!classCode });

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    // ?낅젰媛믪쓣 ?レ옄濡?蹂??(鍮꾩쑉?대?濡??뚯닔???덉슜)
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
    // ?좏슚??寃??(0 ~ 1 ?ъ씠??媛???
    for (const key in editableSettings) {
      if (
        key.endsWith("Rate") &&
        (editableSettings[key] < 0 || editableSettings[key] > 1)
      ) {
        if (
          editableSettings[key] !== "" &&
          !(key === "itemStoreVATRate" && editableSettings[key] > 1)
        ) {
          //遺媛?몃뒗 100% ?섏쓣?섎룄? ?쇰떒 蹂대쪟
          alert(
            `${key} ?몄쑉? 0怨?1 ?ъ씠??媛믪씠?댁빞 ?⑸땲??(?? 3%??0.03). ?꾩옱媛? ${editableSettings[key]}`
          );
          return;
        }
      }
    }

    const settingsRef = doc(db, "governmentSettings", classCode);
    try {
      await updateDoc(settingsRef, {
        taxSettings: {
          // taxSettings ?섏쐞 媛앹껜濡??낅뜲?댄듃
          ...editableSettings,
          lastUpdated: serverTimestamp(),
        },
      });
      refetchSettings();
      alert("?멸툑 ?뺤콉???깃났?곸쑝濡??낅뜲?댄듃?섏뿀?듬땲??");
    } catch (error) {
      console.error("?멸툑 ?뺤콉 ?낅뜲?댄듃 ?ㅽ뙣:", error);
      alert("?멸툑 ?뺤콉 ?낅뜲?댄듃 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.");
    }
  };

  if (!classCode) {
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h2>?숆툒 肄붾뱶媛 ?쒓났?섏? ?딆븯?듬땲??</h2>
        <p>
          ?뺣? 硫붾돱?먯꽌 援?꽭泥?湲곕뒫???ъ슜?섎젮硫??숆툒??癒쇱? 李몄뿬?댁빞 ?⑸땲??
        </p>
      </div>
    );
  }

  if (loadingTreasury || loadingSettings) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "400px",
          fontSize: "18px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        援?꽭泥??곗씠?곕? 遺덈윭?ㅻ뒗 以?(?숆툒: {classCode})...
      </div>
    );
  }

  // ??--- ?듭떖 ?섏젙 ?ы빆 --- ??
  // 紐⑤뱺 ?멸툑 ?섏엯 ??ぉ???뷀븯??'?쒖닔 ?몄닔 珥앺빀'??怨꾩궛?⑸땲??
  const totalTaxRevenue = Object.keys(treasuryData)
    .filter((key) => key.endsWith("Revenue") && key !== "totalAmount")
    .reduce((sum, key) => sum + (treasuryData[key] || 0), 0);

  const taxPolicyFields = [
    {
      name: "stockTransactionTaxRate",
      label: "二쇱떇 嫄곕옒?몄쑉",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
    {
      name: "realEstateTransactionTaxRate",
      label: "遺?숈궛 嫄곕옒?몄쑉",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
    {
      name: "itemStoreVATRate",
      label: "?꾩씠???곸젏 遺媛?몄쑉",
      type: "number",
      step: "0.01",
      min: "0",
      max: "1",
    }, // ?? 10%??0.1
    {
      name: "auctionTransactionTaxRate",
      label: "寃쎈ℓ??嫄곕옒?몄쑉",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
    {
      name: "propertyHoldingTaxRate",
      label: "遺?숈궛 蹂댁쑀?몄쑉",
      type: "number",
      step: "0.0001",
      min: "0",
      max: "1",
    },
    {
      name: "propertyHoldingTaxInterval",
      label: "遺?숈궛 蹂댁쑀??吏뺤닔 二쇨린",
      type: "select",
      options: ["daily", "weekly", "monthly"],
      current_value: editableSettings.propertyHoldingTaxInterval,
    },
    {
      name: "itemMarketTransactionTaxRate",
      label: "?꾩씠???쒖옣 嫄곕옒?몄쑉",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
  ];

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: "16px",
          padding: "30px",
          color: "white",
          marginBottom: "30px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "2.5em", fontWeight: "bold" }}>
          ?룢截?{classCode} ?숆툒 援?꽭泥?
        </h1>
        <p style={{ margin: "10px 0 0 0", fontSize: "1.2em", opacity: 0.9 }}>
          ?멸툑 ?뺤콉 愿由?諛?援?퀬 ?댁쁺
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "30px",
          borderBottom: "2px solid #f0f0f0",
          paddingBottom: "0",
        }}
      >
        {["overview", "revenue", "policy", "analytics"].map((tabId) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            style={{
              padding: "15px 25px",
              border: "none",
              background: activeTab === tabId ? "#667eea" : "transparent",
              color: activeTab === tabId ? "white" : "#666",
              borderRadius: "12px 12px 0 0",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: activeTab === tabId ? "bold" : "normal",
              transition: "all 0.3s ease",
            }}
          >
            {tabId === "overview" && "?뱤 媛쒖슂"}
            {tabId === "revenue" && "?뮥 ?몄닔 ?꾪솴"}
            {tabId === "policy" && "?뱥 ?멸툑 ?뺤콉"}
            {tabId === "analytics" && "?뱢 遺꾩꽍"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "20px",
              marginBottom: "30px",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #4CAF50, #45a049)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(76, 175, 80, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?뮥 珥?援?퀬
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.totalAmount)}
              </p>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #2196F3, #1976D2)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(33, 150, 243, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?뱢 二쇱떇 嫄곕옒???섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.stockTaxRevenue)}
              </p>
            </div>
            {/* [?좉퇋] 二쇱떇 嫄곕옒 ?섏닔猷?移대뱶 */}
            <div
              style={{
                background: "linear-gradient(135deg, #3F51B5, #303F9F)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(63, 81, 181, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?뱥 二쇱떇 嫄곕옒 ?섏닔猷??섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.stockCommissionRevenue)}
              </p>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #FFC107, #FF8F00)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(255, 193, 7, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?룪 遺?숈궛 嫄곕옒???섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.realEstateTransactionTaxRevenue)}
              </p>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #E91E63, #C2185B)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(233, 30, 99, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?썟 ?꾩씠??遺媛???섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.vatRevenue)}
              </p>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #00BCD4, #0097A7)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(0, 188, 212, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?뽳툘 寃쎈ℓ??嫄곕옒???섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.auctionTaxRevenue)}
              </p>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #8BC34A, #689F38)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(139, 195, 74, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?룜截?遺?숈궛 蹂댁쑀???섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.propertyHoldingTaxRevenue)}
              </p>
            </div>
            <div
              style={{
                background: "linear-gradient(135deg, #FF9800, #F57C00)",
                borderRadius: "16px",
                padding: "25px",
                color: "white",
                boxShadow: "0 8px 32px rgba(255, 152, 0, 0.3)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "1.1em",
                  opacity: 0.9,
                }}
              >
                ?삼툘 ?꾩씠???쒖옣 嫄곕옒???섏엯
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.itemMarketTaxRevenue)}
              </p>
            </div>
          </div>
          <div
            style={{
              background: "#f8f9fa",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #e9ecef",
            }}
          >
            <h3 style={{ margin: "0 0 15px 0", color: "#495057" }}>
              ?뱟 理쒓렐 ?낅뜲?댄듃
            </h3>
            <p style={{ margin: 0, color: "#6c757d", fontSize: "16px" }}>
              援?퀬 留덉?留??낅뜲?댄듃: {formatDate(treasuryData.lastUpdated)}
            </p>
            <p
              style={{
                margin: "5px 0 0 0",
                color: "#6c757d",
                fontSize: "16px",
              }}
            >
              ?멸툑 ?뺤콉 留덉?留??낅뜲?댄듃: {formatDate(taxSettings.lastUpdated)}
            </p>
          </div>
        </div>
      )}

      {activeTab === "revenue" && (
        <div>
          <h2 style={{ marginBottom: "20px", color: "#333" }}>
            ?뮥 ?몄닔 ?꾪솴 遺꾩꽍
          </h2>
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "25px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            {/* ??--- ?섏젙??遺遺?--- ??*/}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "25px",
              }}
            >
              <h3 style={{ margin: 0, color: "#333" }}>?몄닔 援ъ꽦</h3>
              <div style={{ textAlign: "right" }}>
                <span style={{ color: "#666", fontSize: "1em" }}>
                  ?몄닔 珥앺빀
                </span>
                <p
                  style={{
                    margin: "5px 0 0 0",
                    fontSize: "1.5em",
                    fontWeight: "bold",
                    color: "#333",
                  }}
                >
                  {formatKoreanCurrency(totalTaxRevenue)}
                </p>
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "15px" }}
            >
              {[
                { label: "Stock Tax", amount: treasuryData.stockTaxRevenue, color: "#2196F3" },
                { label: "Stock Fee", amount: treasuryData.stockCommissionRevenue, color: "#3F51B5" },
                { label: "Real Estate Tax", amount: treasuryData.realEstateTransactionTaxRevenue, color: "#FFC107" },
                { label: "VAT", amount: treasuryData.vatRevenue, color: "#E91E63" },
                { label: "Auction Tax", amount: treasuryData.auctionTaxRevenue, color: "#00BCD4" },
                { label: "Holding Tax", amount: treasuryData.propertyHoldingTaxRevenue, color: "#8BC34A" },
                { label: "Item Market Tax", amount: treasuryData.itemMarketTaxRevenue, color: "#FF9800" },
                { label: "Income Tax", amount: treasuryData.incomeTaxRevenue, color: "#9C27B0" },
                { label: "Corporate Tax", amount: treasuryData.corporateTaxRevenue, color: "#795548" },
                { label: "Other Tax", amount: treasuryData.otherTaxRevenue, color: "#607D8B" },
              ].map((item) => {
                // ??--- ?듭떖 ?섏젙 ?ы빆 --- ??
                // 鍮꾩쑉 怨꾩궛??湲곗???'totalTaxRevenue' (?쒖닔 ?몄닔 珥앺빀)?쇰줈 蹂寃쏀빀?덈떎.
                const totalTaxForPercentage = totalTaxRevenue || 1; // 0?쇰줈 ?섎늻??寃?諛⑹?
                const itemAmount = item.amount || 0;
                const percentage =
                  totalTaxForPercentage > 0
                    ? ((itemAmount / totalTaxForPercentage) * 100).toFixed(1)
                    : "0.0";
                return (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "15px",
                    }}
                  >
                    <div style={{ minWidth: "120px", fontWeight: "bold" }}>
                      {item.label}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        height: "25px",
                        background: "#f0f0f0",
                        borderRadius: "12px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${percentage}%`,
                          height: "100%",
                          background: item.color,
                          transition: "width 0.5s ease",
                        }}
                      ></div>
                    </div>
                    <div style={{ minWidth: "150px", textAlign: "right" }}>
                      {formatKoreanCurrency(itemAmount)} ({percentage}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "policy" && (
        <div>
          <h2 style={{ marginBottom: "20px", color: "#333" }}>
            ?뱥 ?꾪뻾 ?멸툑 ?뺤콉 (?숆툒: {classCode})
          </h2>
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "25px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              marginBottom: "20px",
            }}
          >
            <h3 style={{ color: "#333", marginBottom: "15px" }}>
              ?몄쑉 ?ㅼ젙 (愿由ъ옄)
            </h3>
            {taxPolicyFields.map((field) => (
              <div key={field.name} style={{ marginBottom: "15px" }}>
                <label
                  htmlFor={field.name}
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontWeight: "bold",
                  }}
                >
                  {field.label} (?꾩옱:{" "}
                  {field.type === "select"
                    ? taxSettings[field.name]
                    : `${((taxSettings[field.name] || 0) * 100).toFixed(
                        field.name.includes("propertyHoldingTaxRate") ? 2 : 1
                      )}%`}
                  )
                </label>
                {field.type === "select" ? (
                  <select
                    id={field.name}
                    name={field.name}
                    value={
                      editableSettings[field.name] ||
                      DEFAULT_TAX_SETTINGS[field.name]
                    }
                    onChange={handleIntervalChange}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  >
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    id={field.name}
                    name={field.name}
                    value={
                      editableSettings[field.name] === ""
                        ? ""
                        : editableSettings[field.name]
                    }
                    onChange={handleSettingChange}
                    step={field.step || "0.01"}
                    min={field.min || "0"}
                    max={field.max || "1"}
                    placeholder={`예: ${
                      field.label.includes("부가") ? "0.1 (10%)" : "0.03 (3%)"
                    }`}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "4px",
                      border: "1px solid #ddd",
                    }}
                  />
                )}
                <small
                  style={{ display: "block", marginTop: "3px", color: "#666" }}
                >
                  {field.name === "stockTransactionTaxRate" &&
                    "二쇱떇 留ㅻ룄 ???섏씡?????遺怨?(0.01 = 1%)"}
                  {field.name === "realEstateTransactionTaxRate" &&
                    "遺?숈궛 嫄곕옒 ??嫄곕옒 湲덉븸?????遺怨?(0.03 = 3%)"}
                  {field.name === "itemStoreVATRate" &&
                    "?꾩씠???곸젏 援щℓ ???꾩씠??媛寃⑹뿉 遺怨?(0.1 = 10%)"}
                  {field.name === "auctionTransactionTaxRate" &&
                    "寃쎈ℓ??嫄곕옒 ??嫄곕옒 湲덉븸?????遺怨?(0.03 = 3%)"}
                  {field.name === "propertyHoldingTaxRate" &&
                    "遺?숈궛 媛移섏뿉 ???二쇨린?곸쑝濡?遺怨?(0.002 = 0.2%)"}
                  {field.name === "propertyHoldingTaxInterval" &&
                    "遺?숈궛 蹂댁쑀??吏뺤닔 二쇨린 (?? weekly)"}
                  {field.name === "itemMarketTransactionTaxRate" &&
                    "?꾩씠???쒖옣 嫄곕옒 ??嫄곕옒 湲덉븸?????遺怨?(0.03 = 3%)"}
                </small>
              </div>
            ))}
            <button
              onClick={saveTaxSettings}
              style={{
                padding: "12px 25px",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              ?멸툑 ?뺤콉 ???
            </button>
          </div>
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "25px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ color: "#2196F3", marginBottom: "15px" }}>
              ?렞 ?멸툑 ?뺤콉 紐⑺몴
            </h3>
            <ul style={{ color: "#6c757d", lineHeight: "1.8" }}>
              <li>怨듭젙???쒖옣 寃쎌젣 吏덉꽌 ?뺣┰</li>
              <li>?덉젙?곸씤 ?숆툒 ?ъ젙 ?뺣낫 諛?怨듦났 ?쒕퉬???ъ옄</li>
              <li>寃쎌젣 ?쒕룞 李몄뿬??媛꾩쓽 ?뺥룊???쒓퀬</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div>
          <h2 style={{ marginBottom: "20px", color: "#333" }}>
            ?뱢 ?몄닔 遺꾩꽍 (?숆툒: {classCode})
          </h2>
          {/* 遺꾩꽍 ?댁슜? 湲곗〈怨??좎궗?섍쾶 ?좎??섎릺, ?덈줈???몄닔 ??ぉ?ㅼ쓣 ?ы븿?섏뿬 援ъ꽦?????덉뒿?덈떎. */}
          <p>?닿납???ㅼ뼇???몄닔 遺꾩꽍 李⑦듃???듦퀎 ?뺣낫媛 ?쒖떆?????덉뒿?덈떎.</p>
          <p>?? ?쒓컙???곕Ⅸ ?몄닔 蹂?? 媛??몃ぉ蹂?湲곗뿬??蹂????</p>
        </div>
      )}
    </div>
  );
};

export default NationalTaxService;



