// src/MyProfile.js - 내 프로필 페이지
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { verifyClassCode, db } from "./firebase";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from "firebase/auth";
import Avatar from "./components/Avatar";
import AvatarEditor from "./components/AvatarEditor";
import { getAvatarConfig } from "./utils/avatarSystem";
import { getLevelInfo, LEVEL_THRESHOLDS } from "./utils/levelSystem";
import { getUserAchievements, getAchievementById } from "./utils/achievementSystem";
import { StreakDisplay, StreakRewardInfo } from "./components/DailyReward";
import { formatKoreanCurrency } from "./numberFormatter";
import { User, Key, Building2, Trash2, LogOut, Settings, ChevronRight } from "lucide-react";

export default function MyProfile() {
  const { user, userDoc, logout } = useAuth();
  const userId = user?.uid;
  const userName = userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [avatarConfig, setAvatarConfig] = useState(null);
  const [achievements, setAchievements] = useState([]);

  // 계정 설정 모달 상태
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showClassCodeModal, setShowClassCodeModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // 입력 상태
  const [newNickname, setNewNickname] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 자산 계산
  const cash = Number(userDoc?.cash) || 0;
  const stockValue = Number(userDoc?.stockValue) || 0;
  const realEstateValue = Number(userDoc?.realEstateValue) || 0;
  const itemValue = Number(userDoc?.itemValue) || 0;
  const netAssets = cash + stockValue + realEstateValue + itemValue;

  // 레벨 정보
  const levelInfo = getLevelInfo(netAssets);

  useEffect(() => {
    if (userId) {
      setAvatarConfig(getAvatarConfig(userId));
      setAchievements(getUserAchievements(userId));
    }
  }, [userId]);

  const handleAvatarSave = (newConfig) => {
    setAvatarConfig(newConfig);
  };

  // 모달 초기화
  const resetModals = () => {
    setNewNickname("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewClassCode("");
    setDeleteConfirmText("");
    setError("");
    setIsLoading(false);
  };

  // 닉네임 변경
  const handleChangeNickname = async () => {
    if (!newNickname.trim()) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (newNickname.length < 2 || newNickname.length > 10) {
      setError("닉네임은 2~10자 사이여야 합니다.");
      return;
    }

    setIsLoading(true);
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { nickname: newNickname.trim() });
      alert("닉네임이 변경되었습니다.");
      setShowNicknameModal(false);
      resetModals();
    } catch (err) {
      setError("닉네임 변경에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 비밀번호 변경
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("모든 필드를 입력해주세요.");
      return;
    }
    if (newPassword.length < 6) {
      setError("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      alert("비밀번호가 변경되었습니다.");
      setShowPasswordModal(false);
      resetModals();
    } catch (err) {
      if (err.code === "auth/wrong-password") {
        setError("현재 비밀번호가 올바르지 않습니다.");
      } else {
        setError("비밀번호 변경에 실패했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 학급 코드 변경
  const handleChangeClassCode = async () => {
    if (!newClassCode.trim()) {
      setError("학급 코드를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const isValid = await verifyClassCode(newClassCode.trim());
      if (!isValid) {
        setError("유효하지 않은 학급 코드입니다.");
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { classCode: newClassCode.trim() });
      alert("학급 코드가 변경되었습니다.");
      setShowClassCodeModal(false);
      resetModals();
    } catch (err) {
      setError("학급 코드 변경에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 계정 삭제
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "계정삭제") {
      setError("'계정삭제'를 정확히 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      // Firestore 사용자 문서 삭제
      const userRef = doc(db, "users", userId);
      await deleteDoc(userRef);

      // Firebase Auth 계정 삭제
      await deleteUser(user);

      alert("계정이 삭제되었습니다.");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        setError("보안을 위해 다시 로그인 후 시도해주세요.");
      } else {
        setError("계정 삭제에 실패했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 업적을 레어도 순으로 정렬 (legendary > epic > rare > common)
  const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sortedAchievements = [...achievements].sort((a, b) => {
    const achA = getAchievementById(a.id);
    const achB = getAchievementById(b.id);
    return (rarityOrder[achA?.rarity] || 99) - (rarityOrder[achB?.rarity] || 99);
  });

  // 최고 업적 (가장 레어한 것)
  const bestAchievement = sortedAchievements.length > 0
    ? getAchievementById(sortedAchievements[0].id)
    : null;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-400">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full" style={{ backgroundColor: "#0a0a12" }}>
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-6">
        {/* 페이지 제목 */}
        <h1 style={{
          fontSize: "28px",
          fontWeight: "800",
          background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "24px",
        }}>
          내 프로필
        </h1>

        {/* 프로필 카드 */}
        <div style={{
          background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
          borderRadius: "24px",
          padding: "32px",
          marginBottom: "24px",
          border: "2px solid #374151",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.4)",
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}>
            {/* 아바타 */}
            <div style={{ position: "relative" }}>
              <Avatar config={avatarConfig} size={180} />
              <button
                onClick={() => setShowAvatarEditor(true)}
                style={{
                  position: "absolute",
                  bottom: "5px",
                  right: "5px",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
                  border: "3px solid #1a1a2e",
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 15px rgba(167, 139, 250, 0.4)",
                }}
                title="아바타 수정"
              >
                ✏️
              </button>
            </div>

            {/* 사용자 정보 */}
            <div style={{ textAlign: "center" }}>
              <h2 style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "#e8e8ff",
                marginBottom: "8px",
              }}>
                {userName}
              </h2>

              {/* 레벨 배지 */}
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: `linear-gradient(135deg, ${levelInfo.color}20 0%, ${levelInfo.color}10 100%)`,
                border: `2px solid ${levelInfo.color}`,
                borderRadius: "20px",
                marginBottom: "12px",
              }}>
                <span style={{ fontSize: "20px" }}>{levelInfo.icon}</span>
                <span style={{ color: levelInfo.color, fontWeight: "700", fontSize: "14px" }}>
                  Lv.{levelInfo.level} {levelInfo.title}
                </span>
              </div>

              {/* 최고 업적 */}
              {bestAchievement && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginTop: "8px",
                }}>
                  <span style={{ fontSize: "18px" }}>{bestAchievement.icon}</span>
                  <span style={{
                    color: bestAchievement.rarity === "legendary" ? "#f59e0b" :
                           bestAchievement.rarity === "epic" ? "#a78bfa" :
                           bestAchievement.rarity === "rare" ? "#3b82f6" : "#9ca3af",
                    fontWeight: "600",
                    fontSize: "13px"
                  }}>
                    {bestAchievement.name}
                  </span>
                </div>
              )}

              {/* 출석 스트릭 */}
              <div style={{ marginTop: "12px" }}>
                <StreakDisplay userId={userId} />
              </div>
            </div>
          </div>
        </div>

        {/* 레벨 진행도 카드 */}
        <div style={{
          background: "linear-gradient(145deg, #1e1e3f 0%, #16213e 100%)",
          borderRadius: "20px",
          padding: "24px",
          marginBottom: "24px",
          border: "2px solid #374151",
        }}>
          <h3 style={{
            color: "#a78bfa",
            fontSize: "18px",
            fontWeight: "700",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <span>📊</span> 레벨 진행도
          </h3>

          <div style={{ marginBottom: "16px" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}>
              <span style={{ color: "#9ca3af", fontSize: "14px" }}>
                {levelInfo.icon} Lv.{levelInfo.level} {levelInfo.title}
              </span>
              <span style={{ color: "#e8e8ff", fontSize: "14px", fontWeight: "600" }}>
                {levelInfo.progress.toFixed(1)}%
              </span>
            </div>
            <div style={{
              height: "12px",
              background: "#374151",
              borderRadius: "6px",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${levelInfo.progress}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${levelInfo.color} 0%, ${levelInfo.color}99 100%)`,
                borderRadius: "6px",
                transition: "width 0.5s ease",
              }} />
            </div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "8px",
              fontSize: "12px",
              color: "#6b7280",
            }}>
              <span>현재: {formatKoreanCurrency(netAssets)}</span>
              {levelInfo.level < LEVEL_THRESHOLDS.length - 1 && (
                <span>다음: {formatKoreanCurrency(LEVEL_THRESHOLDS[levelInfo.level + 1]?.minAssets || 0)}</span>
              )}
            </div>
          </div>
        </div>

        {/* 업적 카드 */}
        <div style={{
          background: "linear-gradient(145deg, #1e1e3f 0%, #16213e 100%)",
          borderRadius: "20px",
          padding: "24px",
          marginBottom: "24px",
          border: "2px solid #374151",
        }}>
          <h3 style={{
            color: "#a78bfa",
            fontSize: "18px",
            fontWeight: "700",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <span>🏆</span> 획득한 업적 ({achievements.length}개)
          </h3>

          {achievements.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "32px",
              color: "#6b7280",
            }}>
              아직 획득한 업적이 없습니다.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "12px",
            }}>
              {sortedAchievements.map((ach) => {
                const achievement = getAchievementById(ach.id);
                if (!achievement) return null;

                const rarityColors = {
                  legendary: { bg: "#f59e0b20", border: "#f59e0b", text: "#f59e0b" },
                  epic: { bg: "#a78bfa20", border: "#a78bfa", text: "#a78bfa" },
                  rare: { bg: "#3b82f620", border: "#3b82f6", text: "#3b82f6" },
                  common: { bg: "#6b728020", border: "#6b7280", text: "#9ca3af" },
                };
                const colors = rarityColors[achievement.rarity] || rarityColors.common;

                return (
                  <div
                    key={ach.id}
                    style={{
                      background: colors.bg,
                      border: `2px solid ${colors.border}`,
                      borderRadius: "12px",
                      padding: "16px",
                      textAlign: "center",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>
                      {achievement.icon}
                    </div>
                    <div style={{
                      color: colors.text,
                      fontSize: "12px",
                      fontWeight: "600",
                      marginBottom: "4px",
                    }}>
                      {achievement.name}
                    </div>
                    <div style={{
                      color: "#6b7280",
                      fontSize: "10px",
                    }}>
                      {new Date(ach.unlockedAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 출석 보상 안내 */}
        <StreakRewardInfo />

        {/* 계정 설정 섹션 */}
        <div style={{
          background: "linear-gradient(145deg, #1e1e3f 0%, #16213e 100%)",
          borderRadius: "20px",
          padding: "24px",
          marginBottom: "24px",
          border: "2px solid #374151",
        }}>
          <h3 style={{
            color: "#a78bfa",
            fontSize: "18px",
            fontWeight: "700",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <Settings size={20} /> 계정 설정
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* 현재 학급 코드 표시 */}
            <div style={{
              padding: "16px",
              background: "#0f0f23",
              borderRadius: "12px",
              border: "1px solid #374151",
              marginBottom: "8px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#9ca3af", fontSize: "14px" }}>현재 학급 코드</span>
                <span style={{ color: "#e8e8ff", fontSize: "16px", fontWeight: "600" }}>
                  {userDoc?.classCode || "없음"}
                </span>
              </div>
            </div>

            {/* 닉네임 변경 */}
            <button
              onClick={() => { setShowNicknameModal(true); setError(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px",
                background: "#0f0f23",
                borderRadius: "12px",
                border: "1px solid #374151",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <User size={20} style={{ color: "#a78bfa" }} />
              <span style={{ color: "#e8e8ff", fontSize: "14px", flex: 1, textAlign: "left" }}>닉네임 변경</span>
              <ChevronRight size={18} style={{ color: "#6b7280" }} />
            </button>

            {/* 비밀번호 변경 */}
            <button
              onClick={() => { setShowPasswordModal(true); setError(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px",
                background: "#0f0f23",
                borderRadius: "12px",
                border: "1px solid #374151",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Key size={20} style={{ color: "#a78bfa" }} />
              <span style={{ color: "#e8e8ff", fontSize: "14px", flex: 1, textAlign: "left" }}>비밀번호 변경</span>
              <ChevronRight size={18} style={{ color: "#6b7280" }} />
            </button>

            {/* 학급 코드 변경 */}
            <button
              onClick={() => { setShowClassCodeModal(true); setError(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px",
                background: "#0f0f23",
                borderRadius: "12px",
                border: "1px solid #374151",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Building2 size={20} style={{ color: "#a78bfa" }} />
              <span style={{ color: "#e8e8ff", fontSize: "14px", flex: 1, textAlign: "left" }}>학급 코드 변경</span>
              <ChevronRight size={18} style={{ color: "#6b7280" }} />
            </button>

            {/* 로그아웃 */}
            <button
              onClick={logout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px",
                background: "#0f0f23",
                borderRadius: "12px",
                border: "1px solid #374151",
                cursor: "pointer",
                transition: "all 0.2s",
                marginTop: "8px",
              }}
            >
              <LogOut size={20} style={{ color: "#9ca3af" }} />
              <span style={{ color: "#e8e8ff", fontSize: "14px", flex: 1, textAlign: "left" }}>로그아웃</span>
              <ChevronRight size={18} style={{ color: "#6b7280" }} />
            </button>

            {/* 계정 삭제 */}
            <button
              onClick={() => { setShowDeleteModal(true); setError(""); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "16px",
                background: "rgba(239, 68, 68, 0.1)",
                borderRadius: "12px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <Trash2 size={20} style={{ color: "#ef4444" }} />
              <span style={{ color: "#ef4444", fontSize: "14px", flex: 1, textAlign: "left" }}>계정 삭제</span>
              <ChevronRight size={18} style={{ color: "#ef4444" }} />
            </button>
          </div>
        </div>
      </div>

      {/* 아바타 에디터 모달 */}
      <AvatarEditor
        isOpen={showAvatarEditor}
        onClose={() => setShowAvatarEditor(false)}
        userId={userId}
        onSave={handleAvatarSave}
      />

      {/* 닉네임 변경 모달 */}
      {showNicknameModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          padding: "20px",
        }} onClick={() => { setShowNicknameModal(false); resetModals(); }}>
          <div style={{
            background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
            borderRadius: "20px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%",
            border: "2px solid #374151",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#e8e8ff", fontSize: "18px", fontWeight: "700", marginBottom: "20px" }}>
              닉네임 변경
            </h3>
            <input
              type="text"
              value={newNickname}
              onChange={e => setNewNickname(e.target.value)}
              placeholder="새 닉네임 (2~10자)"
              maxLength={10}
              style={{
                width: "100%",
                padding: "14px",
                background: "#0f0f23",
                border: "2px solid #374151",
                borderRadius: "12px",
                color: "#e8e8ff",
                fontSize: "14px",
                marginBottom: "12px",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setShowNicknameModal(false); resetModals(); }}
                style={{
                  flex: 1, padding: "12px",
                  background: "#374151",
                  border: "none",
                  borderRadius: "10px",
                  color: "#e8e8ff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleChangeNickname}
                disabled={isLoading}
                style={{
                  flex: 1, padding: "12px",
                  background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
                  border: "none",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {showPasswordModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          padding: "20px",
        }} onClick={() => { setShowPasswordModal(false); resetModals(); }}>
          <div style={{
            background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
            borderRadius: "20px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%",
            border: "2px solid #374151",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#e8e8ff", fontSize: "18px", fontWeight: "700", marginBottom: "20px" }}>
              비밀번호 변경
            </h3>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              style={{
                width: "100%",
                padding: "14px",
                background: "#0f0f23",
                border: "2px solid #374151",
                borderRadius: "12px",
                color: "#e8e8ff",
                fontSize: "14px",
                marginBottom: "10px",
              }}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (6자 이상)"
              style={{
                width: "100%",
                padding: "14px",
                background: "#0f0f23",
                border: "2px solid #374151",
                borderRadius: "12px",
                color: "#e8e8ff",
                fontSize: "14px",
                marginBottom: "10px",
              }}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              style={{
                width: "100%",
                padding: "14px",
                background: "#0f0f23",
                border: "2px solid #374151",
                borderRadius: "12px",
                color: "#e8e8ff",
                fontSize: "14px",
                marginBottom: "12px",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setShowPasswordModal(false); resetModals(); }}
                style={{
                  flex: 1, padding: "12px",
                  background: "#374151",
                  border: "none",
                  borderRadius: "10px",
                  color: "#e8e8ff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleChangePassword}
                disabled={isLoading}
                style={{
                  flex: 1, padding: "12px",
                  background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
                  border: "none",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 학급 코드 변경 모달 */}
      {showClassCodeModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          padding: "20px",
        }} onClick={() => { setShowClassCodeModal(false); resetModals(); }}>
          <div style={{
            background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
            borderRadius: "20px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%",
            border: "2px solid #374151",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#e8e8ff", fontSize: "18px", fontWeight: "700", marginBottom: "20px" }}>
              학급 코드 변경
            </h3>
            <p style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "16px" }}>
              현재 학급: <span style={{ color: "#a78bfa", fontWeight: "600" }}>{userDoc?.classCode || "없음"}</span>
            </p>
            <input
              type="text"
              value={newClassCode}
              onChange={e => setNewClassCode(e.target.value.toUpperCase())}
              placeholder="새 학급 코드"
              style={{
                width: "100%",
                padding: "14px",
                background: "#0f0f23",
                border: "2px solid #374151",
                borderRadius: "12px",
                color: "#e8e8ff",
                fontSize: "14px",
                marginBottom: "12px",
                textTransform: "uppercase",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setShowClassCodeModal(false); resetModals(); }}
                style={{
                  flex: 1, padding: "12px",
                  background: "#374151",
                  border: "none",
                  borderRadius: "10px",
                  color: "#e8e8ff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleChangeClassCode}
                disabled={isLoading}
                style={{
                  flex: 1, padding: "12px",
                  background: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
                  border: "none",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 계정 삭제 모달 */}
      {showDeleteModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          padding: "20px",
        }} onClick={() => { setShowDeleteModal(false); resetModals(); }}>
          <div style={{
            background: "linear-gradient(145deg, #1a1a2e 0%, #0f0f23 100%)",
            borderRadius: "20px",
            padding: "24px",
            maxWidth: "400px",
            width: "100%",
            border: "2px solid #ef4444",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "#ef4444", fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              ⚠️ 계정 삭제
            </h3>
            <p style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "16px", lineHeight: 1.6 }}>
              계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
              정말 삭제하시려면 아래에 <span style={{ color: "#ef4444", fontWeight: "600" }}>'계정삭제'</span>를 입력하세요.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="계정삭제"
              style={{
                width: "100%",
                padding: "14px",
                background: "#0f0f23",
                border: "2px solid #ef4444",
                borderRadius: "12px",
                color: "#e8e8ff",
                fontSize: "14px",
                marginBottom: "12px",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setShowDeleteModal(false); resetModals(); }}
                style={{
                  flex: 1, padding: "12px",
                  background: "#374151",
                  border: "none",
                  borderRadius: "10px",
                  color: "#e8e8ff",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isLoading || deleteConfirmText !== "계정삭제"}
                style={{
                  flex: 1, padding: "12px",
                  background: deleteConfirmText === "계정삭제" ? "#ef4444" : "#374151",
                  border: "none",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: (isLoading || deleteConfirmText !== "계정삭제") ? "not-allowed" : "pointer",
                  opacity: (isLoading || deleteConfirmText !== "계정삭제") ? 0.5 : 1,
                }}
              >
                {isLoading ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
