import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, collectionGroup } from 'firebase/firestore';
import { db, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './AuthContext';
import './AdminUserManagement.css';

const AdminUserManagement = () => {
  const { userDoc } = useAuth();
  const [users, setUsers] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const isSuperAdmin = userDoc?.isSuperAdmin === true;
  const isAdmin = userDoc?.isAdmin === true;
  const classCode = userDoc?.classCode;

  useEffect(() => {
    const fetchUsers = async () => {
      if (!userDoc) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        let usersData = [];

        if (isSuperAdmin) {
          // 슈퍼관리자: 모든 학급의 모든 학생 조회
          console.log('[AdminUserManagement] 슈퍼관리자 - 모든 학생 조회');

          // 모든 Class 문서 조회
          const classesRef = collection(db, 'Class');
          const classesSnapshot = await getDocs(classesRef);

          // 각 학급의 students 조회
          for (const classDoc of classesSnapshot.docs) {
            const classCodeValue = classDoc.id;
            const studentsRef = collection(db, 'Class', classCodeValue, 'students');
            const studentsSnapshot = await getDocs(studentsRef);

            studentsSnapshot.docs.forEach(studentDoc => {
              const data = studentDoc.data();
              usersData.push({
                id: studentDoc.id,
                classCode: classCodeValue,
                ...data,
                money: data.money !== undefined && data.money !== null ? data.money : 0,
              });
            });
          }

          console.log(`[AdminUserManagement] 슈퍼관리자 - 총 ${usersData.length}명 조회 완료`);
        } else if (isAdmin && classCode) {
          // 일반 관리자: 본인 학급의 학생만 조회
          console.log(`[AdminUserManagement] 일반 관리자 - ${classCode} 학급 학생 조회`);

          const studentsCollectionRef = collection(db, 'Class', classCode, 'students');
          const querySnapshot = await getDocs(studentsCollectionRef);

          usersData = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              classCode: classCode,
              ...data,
              money: data.money !== undefined && data.money !== null ? data.money : 0,
            };
          });

          console.log(`[AdminUserManagement] 일반 관리자 - ${usersData.length}명 조회 완료`);
        }

        setUsers(usersData);
      } catch (error) {
        console.error("학생 정보를 불러오는 데 실패했습니다:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [userDoc, isSuperAdmin, isAdmin, classCode]);

  const handleRehabilitate = async (studentId, studentName, studentClassCode) => {
    if (window.confirm(`정말로 '${studentName}' 학생을 개인회생 처리하시겠습니까?\n해당 학생의 모든 자산(돈, 주식, 부동산 등)이 0으로 초기화되고 모든 빚이 청산됩니다. 이 작업은 되돌릴 수 없습니다.`)) {
      try {
        const executeRehabilitation = httpsCallable(functions, 'executePersonalRehabilitation');
        const result = await executeRehabilitation({ classCode: studentClassCode, studentId });

        alert(result.data.message);
        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.id === studentId ? { ...user, money: 0 } : user
          )
        );
      } catch (error) {
        console.error("개인회생 처리 중 오류 발생:", error);
        alert(`오류가 발생했습니다: ${error.message}`);
      }
    }
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    setEditFormData({ ...user });
  };

  const handleCancel = () => {
    setEditingUserId(null);
    setEditFormData({});
  };

  const handleSave = async (id) => {
    const userToEdit = users.find(u => u.id === id);
    if (!userToEdit) return;

    const userClassCode = userToEdit.classCode;

    try {
      const userDocRef = doc(db, 'Class', userClassCode, 'students', id);
      const dataToSave = {
        ...editFormData,
        money: Number(editFormData.money) || 0,
        level: Number(editFormData.level) || 0,
      };
      delete dataToSave.password;
      delete dataToSave.classCode; // classCode는 업데이트하지 않음

      await updateDoc(userDocRef, dataToSave);

      // 관리자이고 비밀번호가 입력된 경우에만 비밀번호 변경
      if ((isAdmin || isSuperAdmin) && editFormData.password && editFormData.password.trim() !== '') {
        const updatePassword = httpsCallable(functions, 'updateUserPassword');
        await updatePassword({
          email: editFormData.email,
          newPassword: editFormData.password
        });
        alert('학생 정보 및 비밀번호가 성공적으로 업데이트되었습니다.');
      } else {
        alert('학생 정보가 성공적으로 업데이트되었습니다.');
      }

      setUsers(prevUsers =>
        prevUsers.map(user => (user.id === id ? { ...user, ...dataToSave, classCode: userClassCode } : user))
      );
      setEditingUserId(null);
    } catch (error) {
      console.error("학생 정보 업데이트 중 오류 발생:", error);
      alert(`정보 업데이트에 실패했습니다: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) return;

    const userClassCode = userToDelete.classCode;

    if (window.confirm('정말로 이 학생을 삭제하시겠습니까? 모든 데이터가 사라집니다.')) {
      try {
        await deleteDoc(doc(db, 'Class', userClassCode, 'students', id));
        setUsers(prevUsers => prevUsers.filter(user => user.id !== id));
        alert('학생이 삭제되었습니다.');
      } catch (error) {
        console.error("학생 삭제 중 오류 발생:", error);
        alert('학생 삭제에 실패했습니다.');
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  const filteredUsers = users.filter(user =>
    (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.classCode?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="loading-container">데이터를 불러오는 중입니다...</div>;
  }

  if (!isAdmin && !isSuperAdmin) {
    return <div className="loading-container">관리자 권한이 필요합니다.</div>;
  }

  const pageTitle = isSuperAdmin
    ? '전체 학생 정보 관리 (슈퍼 관리자)'
    : `학생 정보 관리 (학급: ${classCode})`;

  return (
    <div className="admin-user-management">
      <h2 className="management-title">{pageTitle}</h2>
      <div className="search-container">
        <input
          type="text"
          placeholder={isSuperAdmin ? "이름, 이메일 또는 학급 코드로 검색" : "이름 또는 이메일로 검색"}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      <div className="user-cards-container">
        {filteredUsers.map(user => (
          <div key={user.id} className="user-card">
            {editingUserId === user.id ? (
              <div className="edit-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label>이름</label>
                    <input type="text" name="name" value={editFormData.name || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>이메일</label>
                    <input type="email" name="email" readOnly value={editFormData.email || ''} />
                  </div>
                  {isSuperAdmin && (
                    <div className="form-group">
                      <label>학급 코드</label>
                      <input type="text" name="classCode" readOnly value={editFormData.classCode || ''} />
                    </div>
                  )}
                  {(isAdmin || isSuperAdmin) && (
                    <div className="form-group">
                      <label>비밀번호 (변경시에만 입력)</label>
                      <input
                        type="password"
                        name="password"
                        value={editFormData.password || ''}
                        onChange={handleInputChange}
                        placeholder="변경하지 않으려면 비워두세요"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>직업</label>
                    <input type="text" name="jobName" value={editFormData.job?.name || editFormData.jobName || ''} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>레벨</label>
                    <input type="number" name="level" value={editFormData.level || 0} onChange={handleInputChange} />
                  </div>
                  <div className="form-group">
                    <label>잔액</label>
                    <input type="number" name="money" value={editFormData.money} onChange={handleInputChange} />
                  </div>
                </div>
                <div className="card-actions">
                  <button onClick={() => handleSave(user.id)} className="action-button save">저장</button>
                  <button onClick={handleCancel} className="action-button cancel">취소</button>
                </div>
              </div>
            ) : (
              <div className="view-mode">
                <div className="user-info">
                  <p><strong>이름:</strong> {user.name}</p>
                  <p><strong>이메일:</strong> {user.email}</p>
                  {isSuperAdmin && <p><strong>학급:</strong> {user.classCode}</p>}
                  <p><strong>직업:</strong> {user.job?.name || user.jobName || '미지정'}</p>
                  <p><strong>레벨:</strong> {user.level || 0}</p>
                  <p style={{ color: user.money < 0 ? 'red' : 'inherit' }}>
                    <strong>잔액:</strong> {user.money?.toLocaleString() || 0}원
                  </p>
                </div>
                <div className="card-actions">
                  <button onClick={() => handleEdit(user)} className="action-button edit">수정</button>
                  <button onClick={() => handleDelete(user.id)} className="action-button delete">삭제</button>
                  <button
                    onClick={() => handleRehabilitate(user.id, user.name, user.classCode)}
                    className="action-button rehabilitate"
                  >
                    개인회생
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminUserManagement;
