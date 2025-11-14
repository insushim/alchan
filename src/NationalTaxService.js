// src/NationalTaxService.js
import React, { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment, // 국고 업데이트 시 사용
} from "firebase/firestore";
import { usePolling } from "./hooks/usePolling";

import { formatKoreanCurrency } from "./numberFormatter";

const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return "유효하지 않은 날짜";
  return date.toLocaleString("ko-KR");
};

// [수정] 기본 국고 데이터에 stockCommissionRevenue 추가
const DEFAULT_TREASURY_DATA = {
  totalAmount: 0,
  stockTaxRevenue: 0,
  stockCommissionRevenue: 0, // 주식 거래 수수료 수입
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

// 기본 세금 정책 설정 (Firestore에 없을 경우 사용될 초기값)
const DEFAULT_TAX_SETTINGS = {
  stockTransactionTaxRate: 0.01, // 주식 거래세율 (1%)
  realEstateTransactionTaxRate: 0.03, // 부동산 거래세율 (3%)
  itemStoreVATRate: 0.1, // 아이템 상점 부가가치세율 (10%)
  auctionTransactionTaxRate: 0.03, // 경매장 거래세율 (3%)
  propertyHoldingTaxRate: 0.002, // 부동산 보유세율 (0.2%)
  propertyHoldingTaxInterval: "weekly", // 부동산 보유세 징수 주기 (예: weekly, monthly)
  itemMarketTransactionTaxRate: 0.03, // 아이템 시장 거래세율 (3%)
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

  // 국고 데이터 폴링 (classCode 기반)
  const fetchTreasuryData = useCallback(async () => {
    if (!classCode) {
      setLoadingTreasury(false);
      setTreasuryData(DEFAULT_TREASURY_DATA);
      return;
    }
    setLoadingTreasury(true);
    const treasuryRef = doc(db, "nationalTreasuries", classCode);
    try {
      const docSnap = await getDoc(treasuryRef);
      if (docSnap.exists()) {
        // [수정] 기본값과 합쳐서 누락된 필드가 없도록 보장
        setTreasuryData({ ...DEFAULT_TREASURY_DATA, ...docSnap.data() });
      } else {
        await setDoc(treasuryRef, {
          ...DEFAULT_TREASURY_DATA,
          createdAt: serverTimestamp(), // 생성 시점 추가
          lastUpdated: serverTimestamp(),
        });
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

  const { refetch: refetchTreasury } = usePolling(fetchTreasuryData, 30000);

  // 세금 정책 설정 폴링 (classCode 기반)
  const fetchTaxSettings = useCallback(async () => {
    if (!classCode) {
      setLoadingSettings(false);
      setTaxSettings(DEFAULT_TAX_SETTINGS);
      setEditableSettings(DEFAULT_TAX_SETTINGS);
      return;
    }
    setLoadingSettings(true);
    const settingsRef = doc(db, "governmentSettings", classCode); // 세율은 governmentSettings에 통합
    try {
      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists() && docSnap.data().taxSettings) {
        const newSettings = {
          ...DEFAULT_TAX_SETTINGS,
          ...docSnap.data().taxSettings,
        }; // taxSettings 하위 객체로 관리
        setTaxSettings(newSettings);
        setEditableSettings(newSettings);
      } else {
        // 기본 설정값으로 문서 생성 (taxSettings 하위 객체 포함)
        await setDoc(
          settingsRef,
          {
            taxSettings: {
              ...DEFAULT_TAX_SETTINGS,
              lastUpdated: serverTimestamp(),
            },
          },
          { merge: true }
        );
        setTaxSettings(DEFAULT_TAX_SETTINGS);
        setEditableSettings(DEFAULT_TAX_SETTINGS);
      }
      setLoadingSettings(false);
    } catch (error) {
      console.error(`[${classCode}] 세금 정책 로드 실패:`, error);
      setLoadingSettings(false);
    }
  }, [classCode]);

  const { refetch: refetchSettings } = usePolling(fetchTaxSettings, 30000);

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    // 입력값을 숫자로 변환 (비율이므로 소수점 허용)
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
    // 유효성 검사 (0 ~ 1 사이의 값 등)
    for (const key in editableSettings) {
      if (
        key.endsWith("Rate") &&
        (editableSettings[key] < 0 || editableSettings[key] > 1)
      ) {
        if (
          editableSettings[key] !== "" &&
          !(key === "itemStoreVATRate" && editableSettings[key] > 1)
        ) {
          //부가세는 100% 넘을수도? 일단 보류
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
          // taxSettings 하위 객체로 업데이트
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
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h2>학급 코드가 제공되지 않았습니다.</h2>
        <p>
          정부 메뉴에서 국세청 기능을 사용하려면 학급에 먼저 참여해야 합니다.
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
        국세청 데이터를 불러오는 중 (학급: {classCode})...
      </div>
    );
  }

  // ✨ --- 핵심 수정 사항 --- ✨
  // 모든 세금 수입 항목을 더하여 '순수 세수 총합'을 계산합니다.
  const totalTaxRevenue = Object.keys(treasuryData)
    .filter((key) => key.endsWith("Revenue") && key !== "totalAmount")
    .reduce((sum, key) => sum + (treasuryData[key] || 0), 0);

  const taxPolicyFields = [
    {
      name: "stockTransactionTaxRate",
      label: "주식 거래세율",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
    {
      name: "realEstateTransactionTaxRate",
      label: "부동산 거래세율",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
    {
      name: "itemStoreVATRate",
      label: "아이템 상점 부가세율",
      type: "number",
      step: "0.01",
      min: "0",
      max: "1",
    }, // 예: 10%는 0.1
    {
      name: "auctionTransactionTaxRate",
      label: "경매장 거래세율",
      type: "number",
      step: "0.001",
      min: "0",
      max: "1",
    },
    {
      name: "propertyHoldingTaxRate",
      label: "부동산 보유세율",
      type: "number",
      step: "0.0001",
      min: "0",
      max: "1",
    },
    {
      name: "propertyHoldingTaxInterval",
      label: "부동산 보유세 징수 주기",
      type: "select",
      options: ["daily", "weekly", "monthly"],
      current_value: editableSettings.propertyHoldingTaxInterval,
    },
    {
      name: "itemMarketTransactionTaxRate",
      label: "아이템 시장 거래세율",
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
          🏛️ {classCode} 학급 국세청
        </h1>
        <p style={{ margin: "10px 0 0 0", fontSize: "1.2em", opacity: 0.9 }}>
          세금 정책 관리 및 국고 운영
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
            {tabId === "overview" && "📊 개요"}
            {tabId === "revenue" && "💰 세수 현황"}
            {tabId === "policy" && "📋 세금 정책"}
            {tabId === "analytics" && "📈 분석"}
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
                💰 총 국고
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
                📈 주식 거래세 수입
              </h3>
              <p style={{ margin: 0, fontSize: "2.2em", fontWeight: "bold" }}>
                {formatKoreanCurrency(treasuryData.stockTaxRevenue)}
              </p>
            </div>
            {/* [신규] 주식 거래 수수료 카드 */}
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
                📋 주식 거래 수수료 수입
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
                🏡 부동산 거래세 수입
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
                🛒 아이템 부가세 수입
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
                ⚖️ 경매장 거래세 수입
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
                🏘️ 부동산 보유세 수입
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
                ♻️ 아이템 시장 거래세 수입
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
              📅 최근 업데이트
            </h3>
            <p style={{ margin: 0, color: "#6c757d", fontSize: "16px" }}>
              국고 마지막 업데이트: {formatDate(treasuryData.lastUpdated)}
            </p>
            <p
              style={{
                margin: "5px 0 0 0",
                color: "#6c757d",
                fontSize: "16px",
              }}
            >
              세금 정책 마지막 업데이트: {formatDate(taxSettings.lastUpdated)}
            </p>
          </div>
        </div>
      )}

      {activeTab === "revenue" && (
        <div>
          <h2 style={{ marginBottom: "20px", color: "#333" }}>
            💰 세수 현황 분석
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
            {/* ✨ --- 수정된 부분 --- ✨ */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "25px",
              }}
            >
              <h3 style={{ margin: 0, color: "#333" }}>세수 구성</h3>
              <div style={{ textAlign: "right" }}>
                <span style={{ color: "#666", fontSize: "1em" }}>
                  세수 총합
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
                {
                  label: "주식세",
                  amount: treasuryData.stockTaxRevenue,
                  color: "#2196F3",
                },
                {
                  label: "주식 수수료",
                  amount: treasuryData.stockCommissionRevenue,
                  color: "#3F51B5",
                },
                {
                  label: "부동산 거래세",
                  amount: treasuryData.realEstateTransactionTaxRevenue,
                  color: "#FFC107",
                },
                {
                  label: "아이템 부가세",
                  amount: treasuryData.vatRevenue,
                  color: "#E91E63",
                },
                {
                  label: "경매장 거래세",
                  amount: treasuryData.auctionTaxRevenue,
                  color: "#00BCD4",
                },
                {
                  label: "부동산 보유세",
                  amount: treasuryData.propertyHoldingTaxRevenue,
                  color: "#8BC34A",
                },
                {
                  label: "아이템 시장세",
                  amount: treasuryData.itemMarketTaxRevenue,
                  color: "#FF9800",
                },
                {
                  label: "소득세 (기타)",
                  amount: treasuryData.incomeTaxRevenue,
                  color: "#9C27B0",
                },
                {
                  label: "법인세 (기타)",
                  amount: treasuryData.corporateTaxRevenue,
                  color: "#795548",
                },
                {
                  label: "기타 세수",
                  amount: treasuryData.otherTaxRevenue,
                  color: "#607D8B",
                },
              ].map((item) => {
                // ✨ --- 핵심 수정 사항 --- ✨
                // 비율 계산의 기준을 'totalTaxRevenue' (순수 세수 총합)으로 변경합니다.
                const totalTaxForPercentage = totalTaxRevenue || 1; // 0으로 나누는 것 방지
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
            📋 현행 세금 정책 (학급: {classCode})
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
              세율 설정 (관리자)
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
                  {field.label} (현재:{" "}
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
                      field.label.includes("부가세") ? "0.1 (10%)" : "0.03 (3%)"
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
                    "주식 매도 시 수익에 대해 부과 (0.01 = 1%)"}
                  {field.name === "realEstateTransactionTaxRate" &&
                    "부동산 거래 시 거래 금액에 대해 부과 (0.03 = 3%)"}
                  {field.name === "itemStoreVATRate" &&
                    "아이템 상점 구매 시 아이템 가격에 부과 (0.1 = 10%)"}
                  {field.name === "auctionTransactionTaxRate" &&
                    "경매장 거래 시 거래 금액에 대해 부과 (0.03 = 3%)"}
                  {field.name === "propertyHoldingTaxRate" &&
                    "부동산 가치에 대해 주기적으로 부과 (0.002 = 0.2%)"}
                  {field.name === "propertyHoldingTaxInterval" &&
                    "부동산 보유세 징수 주기 (예: weekly)"}
                  {field.name === "itemMarketTransactionTaxRate" &&
                    "아이템 시장 거래 시 거래 금액에 대해 부과 (0.03 = 3%)"}
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
              세금 정책 저장
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
              🎯 세금 정책 목표
            </h3>
            <ul style={{ color: "#6c757d", lineHeight: "1.8" }}>
              <li>공정한 시장 경제 질서 확립</li>
              <li>안정적인 학급 재정 확보 및 공공 서비스 투자</li>
              <li>경제 활동 참여자 간의 형평성 제고</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div>
          <h2 style={{ marginBottom: "20px", color: "#333" }}>
            📈 세수 분석 (학급: {classCode})
          </h2>
          {/* 분석 내용은 기존과 유사하게 유지하되, 새로운 세수 항목들을 포함하여 구성할 수 있습니다. */}
          <p>이곳에 다양한 세수 분석 차트나 통계 정보가 표시될 수 있습니다.</p>
          <p>예: 시간에 따른 세수 변화, 각 세목별 기여도 변화 등.</p>
        </div>
      )}
    </div>
  );
};

export default NationalTaxService;