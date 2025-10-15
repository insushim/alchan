import React, { useState, useEffect, useContext } from 'react';
import { db, functions } from './firebase';
import { doc, getDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AdminPanel from './AdminPanel';
import AdminDatabase from './AdminDatabase';
import { AuthContext } from './AuthContext';
import './AdminPanel.css';

const AdminPage = () => {
  const { currentUser, classCode } = useContext(AuthContext);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [marketStatus, setMarketStatus] = useState({ isOpen: false });
  const [activeTab, setActiveTab] = useState('financial'); // 'financial', 'database', 'market'

  // 백엔드 함수 이름과 정확히 일치시킵니다.
  const toggleMarketManually = httpsCallable(functions, 'toggleMarketManually');
  const refundOldMarketItems = httpsCallable(functions, 'refundOldMarketItems');

  useEffect(() => {
    if (!classCode) return;

    const fetchStudents = async () => {
      const studentsCollection = collection(db, `Class/${classCode}/students`);
      const studentSnapshot = await getDocs(studentsCollection);
      const studentList = studentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStudents(studentList);
    };

    const fetchMarketStatus = async () => {
      // classCode를 포함한 정확한 DB 경로를 바라보도록 수정합니다.
      const marketStatusRef = doc(db, `ClassStock/${classCode}/marketStatus/status`);
      const docSnap = await getDoc(marketStatusRef);
      if (docSnap.exists()) {
        setMarketStatus(docSnap.data());
      } else {
        // 해당 경로에 문서가 없으면 기본값으로 생성해줍니다.
        await setDoc(marketStatusRef, { isOpen: false });
        setMarketStatus({ isOpen: false });
      }
    };

    fetchStudents();
    fetchMarketStatus();
  }, [classCode]);

  const handleMoneyTransfer = async () => {
    if (!selectedStudent || !amount) {
      setMessage('학생과 금액을 모두 선택해주세요.');
      return;
    }
    // 돈 지급 로직... (여기에 화폐 지급 관련 로직을 구현하세요)
    // 예: const giveMoney = httpsCallable(functions, 'giveMoneyToStudent');
    // await giveMoney({ classCode, studentId: selectedStudent, amount: Number(amount) });
    setMessage(`${selectedStudent} 학생에게 ${amount}원을 지급하는 로직을 추가해야 합니다.`);
  };

  const handleMarketControl = async (newIsOpenState) => {
    try {
      const actionText = newIsOpenState ? '수동 개장' : '수동 폐장';
      if (!window.confirm(`정말로 시장을 '${actionText}' 상태로 변경하시겠습니까?`)) {
        return;
      }

      // 함수를 호출할 때 'classCode'와 'isOpen' 파라미터를 정확히 전달합니다.
      const result = await toggleMarketManually({
        classCode: classCode,
        isOpen: newIsOpenState
      });

      console.log('Market status change result:', result.data);
      setMessage(result.data.message);

      // 프론트엔드 화면의 상태를 즉시 업데이트합니다.
      setMarketStatus({ isOpen: newIsOpenState });

    } catch (error) {
      console.error("시장 상태 변경 오류:", error);
      setMessage(`오류가 발생했습니다: ${error.message}`);
    }
  };

  const handleRefundOldItems = async () => {
    try {
      if (!window.confirm('기존 경로에 있는 마켓 아이템들을 모두 환불하시겠습니까?\n(판매자들의 인벤토리로 아이템이 반환됩니다)')) {
        return;
      }

      setMessage('환불 처리 중...');
      const result = await refundOldMarketItems();

      console.log('Refund result:', result.data);
      setMessage(result.data.message);

    } catch (error) {
      console.error("마켓 아이템 환불 오류:", error);
      setMessage(`오류가 발생했습니다: ${error.message}`);
    }
  };

  if (!currentUser?.isAdmin && !currentUser?.isSuperAdmin) {
    return <div>관리자만 접근할 수 있는 페이지입니다.</div>;
  }

  return (
    <div className="admin-page-container">
      <div className="admin-content">
        <h1>관리자 페이지 (CLASS: {classCode})</h1>

        {/* 탭 메뉴 */}
        <div className="admin-tabs mb-6 border-b">
          <div className="flex flex-wrap">
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'financial'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('financial')}
            >
              금융 상품 관리
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'database'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('database')}
            >
              데이터베이스
            </button>
            <button
              className={`py-2 px-4 font-medium ${
                activeTab === 'market'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('market')}
            >
              시장 제어
            </button>
          </div>
        </div>

        {/* 금융 상품 관리 탭 */}
        {activeTab === 'financial' && <AdminPanel />}

        {/* 데이터베이스 탭 */}
        {activeTab === 'database' && <AdminDatabase />}

        {/* 시장 제어 탭 */}
        {activeTab === 'market' && (
          <div>
            <div className="admin-section">
              <h2>주식 시장 제어</h2>
              <p>현재 상태: <span className={marketStatus.isOpen ? 'market-open' : 'market-closed'}>
                {marketStatus.isOpen ? '개장' : '폐장'}
              </span></p>
              <div className="market-controls">
                <button
                  onClick={() => handleMarketControl(true)}
                  disabled={marketStatus.isOpen}
                  className="control-button open"
                >
                  수동 개장
                </button>
                <button
                  onClick={() => handleMarketControl(false)}
                  disabled={!marketStatus.isOpen}
                  className="control-button close"
                >
                  수동 폐장
                </button>
              </div>
              <p className="description">
                버튼을 누르면 정해진 시간과 상관없이 시장 상태가 즉시 변경됩니다.<br/>
                자동 개장/폐장 시간(오전 8시/오후 3시)이 되면 자동으로 상태가 변경됩니다.
              </p>
            </div>

            <div className="admin-section">
              <h2>화폐 지급</h2>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                <option value="">학생 선택</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>{student.name} ({student.id})</option>
                ))}
              </select>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="금액 입력"
              />
              <button onClick={handleMoneyTransfer}>지급</button>
            </div>

            <div className="admin-section">
              <h2>아이템 마켓 데이터 정리</h2>
              <p className="description">
                기존 경로(루트 marketItems)에 있는 마켓 아이템들을 모두 환불합니다.<br/>
                판매자들의 인벤토리로 아이템이 자동 반환됩니다.
              </p>
              <button
                onClick={handleRefundOldItems}
                className="control-button close"
                style={{ marginTop: '10px' }}
              >
                기존 마켓 아이템 환불
              </button>
            </div>

            {message && <p className="message-box">{message}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;