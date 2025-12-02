// src/App.js
// 알찬(Alchan) - 학급 경제 시뮬레이션 앱

import React, { useEffect, Suspense, lazy } from "react";
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
      });
    }
  }, []);

  return (
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
  );
}

export default App;
