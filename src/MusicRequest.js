import React, { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { usePolling } from './hooks/usePolling';
import './MusicRequest.css';

const MusicRequest = ({ user }) => {
    const [roomName, setRoomName] = useState('');
    const [createdRoom, setCreatedRoom] = useState(null); // 새로 생성된 방 정보
    const [error, setError] = useState('');
    const navigate = useNavigate();

    // 사용자가 생성한 방 목록을 폴링으로 가져옵니다.
    const { data: myRooms, loading, refetch } = usePolling(
        async () => {
            if (!user) return [];
            const q = query(collection(db, "musicRooms"), where("teacherId", "==", user.uid));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        { interval: 30000, enabled: !!user, deps: [user] }
    );

    // 방이 삭제되었을 경우를 대비하여, 현재 보고 있는 createdRoom이 실제로 존재하는지 확인합니다.
    usePolling(
        async () => {
            if (!createdRoom) return null;
            const docSnap = await getDoc(doc(db, "musicRooms", createdRoom.id));
            if (!docSnap.exists()) {
                setCreatedRoom(null); // 방이 삭제되었다면 상태를 초기화합니다.
            }
            return docSnap.exists();
        },
        { interval: 30000, enabled: !!createdRoom, deps: [createdRoom] }
    );


    const createRoom = async () => {
        if (!roomName.trim()) {
            setError('방 이름을 입력해주세요.');
            return;
        }
        setError('');
        try {
            const q = query(collection(db, "musicRooms"), where("name", "==", roomName.trim()), where("teacherId", "==", user.uid));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                setError('이미 같은 이름의 방이 존재합니다.');
                return;
            }

            const docRef = await addDoc(collection(db, 'musicRooms'), {
                name: roomName,
                teacherId: user.uid,
                createdAt: new Date(),
            });
            refetch(); // 방 목록 즉시 갱신
            // 새로 생성된 방의 정보를 상태에 저장합니다.
            setCreatedRoom({ id: docRef.id, name: roomName });
            setRoomName(''); // 입력 필드 초기화
        } catch (e) {
            console.error("Error adding document: ", e);
            setError('방을 만드는 중 오류가 발생했습니다.');
        }
    };

    const getRoomUrl = (roomId) => {
        return `${window.location.origin}/student-request/${roomId}`;
    };

    if (!user) {
        return <div>로그인이 필요합니다.</div>;
    }

    return (
        <div className="music-request-container">
            <h2>음악 신청방</h2>
            
            {/* 방 만들기 섹션 */}
            <div className="create-room-section">
                <h3>새로운 방 만들기</h3>
                <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="방 이름을 입력하세요"
                    className="room-name-input"
                />
                <button onClick={createRoom} className="create-room-btn">방 만들기</button>
                {error && <p className="error-message">{error}</p>}
            </div>
            
            {/* 새로 생성된 방 정보 표시 */}
            {createdRoom && (
                <div className="room-created-section">
                    <h3>"{createdRoom.name}" 방이 생성되었습니다!</h3>
                    <p>학생들에게 아래 QR코드를 보여주거나 링크를 공유해주세요.</p>
                    <div className="qr-code-container">
                        <QRCodeSVG value={getRoomUrl(createdRoom.id)} size={256} />
                    </div>
                    <p className="room-link">{getRoomUrl(createdRoom.id)}</p>
                    <Link to={`/music-room/${createdRoom.id}`} className="enter-room-link">
                        음악 재생 목록 보기
                    </Link>
                </div>
            )}

            {/* 내가 만든 방 목록 */}
            <div className="my-rooms-section">
                <h3>내가 만든 방 목록</h3>
                {myRooms && myRooms.length > 0 ? (
                    <ul className="my-rooms-list">
                        {myRooms.map(room => (
                            <li key={room.id} className="my-room-item">
                                <Link to={`/music-room/${room.id}`}>
                                    <span>{room.name}</span>
                                    <small>({new Date(room.createdAt.seconds * 1000).toLocaleString()})</small>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>아직 생성한 방이 없습니다.</p>
                )}
            </div>
        </div>
    );
};

export default MusicRequest;