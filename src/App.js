// src/App.js
// 알찬(Alchan) - 학급 경제 시뮬레이션 앱

import React, { useEffect, Suspense, lazy, Component } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import { ItemProvider } from "./ItemContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SkeletonPage } from "./components/ui/Skeleton";

// 코드 스플리팅 - 레이아웃과 로그인 페이지
const AlchanLayout = lazy(() => import("./components/AlchanLayout"));
const Login = lazy(() => import("./Login"));

// 기본 스타일 (Tailwind 이전에 로드하여 Tailwind가 우선권을 가지도록)
import "./styles.css";
import "./App.css";
import "./index.css"; // Tailwind CSS - 마지막에 import하여 우선 적용

// 🔥 에러 바운더리 - PWA 흰화면 방지
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[알찬] 앱 오류 발생:', error, errorInfo);

    // IndexedDB나 캐시 관련 오류면 캐시 삭제 후 새로고침
    const errorString = error?.toString() || '';
    if (errorString.includes('IndexedDB') ||
        errorString.includes('QuotaExceeded') ||
        errorString.includes('SecurityError') ||
        errorString.includes('InvalidStateError')) {
      console.log('[알찬] 스토리지 오류 감지 - 캐시 초기화');
      this.clearCachesAndReload();
    }
  }

  clearCachesAndReload = async () => {
    try {
      // IndexedDB 삭제
      if (window.indexedDB) {
        const databases = await window.indexedDB.databases?.() || [];
        databases.forEach(db => {
          if (db.name) {
            window.indexedDB.deleteDatabase(db.name);
          }
        });
      }

      // 캐시 삭제
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }

      // 로컬스토리지 삭제
      localStorage.clear();
      sessionStorage.clear();

      // 새로고침
      window.location.reload(true);
    } catch (e) {
      console.error('[알찬] 캐시 삭제 실패:', e);
      window.location.reload(true);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          color: 'white',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😢</div>
          <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>앱을 불러오는 중 문제가 발생했습니다</h1>
          <p style={{ marginBottom: '24px', opacity: 0.8 }}>잠시 후 자동으로 다시 시도합니다...</p>
          <button
            onClick={this.clearCachesAndReload}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#4f46e5',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            지금 다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  // FCM 서비스 워커에 설정 전달
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration.active) {
          const firebaseConfig = {
            apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
            authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
            storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.REACT_APP_FIREBASE_APP_ID
          };
          registration.active.postMessage({
            type: 'FIREBASE_CONFIG',
            config: firebaseConfig
          });
        }
      }).catch(err => {
        console.warn('[알찬] 서비스워커 준비 실패 (무시):', err);
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ItemProvider>
            <Router>
              <Suspense fallback={<SkeletonPage />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/*" element={<AlchanLayout />} />
                </Routes>
              </Suspense>
            </Router>
          </ItemProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
