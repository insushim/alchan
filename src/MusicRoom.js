import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { doc, getDoc, collection, query, orderBy, deleteDoc, getDocs } from 'firebase/firestore';
import YouTube from 'react-youtube';
import { QRCodeSVG } from 'qrcode.react';
import { usePolling } from './hooks/usePolling';
import './MusicRoom.css';

const MusicRoom = ({ user }) => {
    const { roomId } = useParams();
    const [room, setRoom] = useState(null);
    const [playlist, setPlaylist] = useState([]);
    const [currentVideoId, setCurrentVideoId] = useState(null);
    const navigate = useNavigate();

    // Use polling for room data
    const { refetch: refetchRoom } = usePolling(
        async () => {
            if (!user) return null;

            const roomRef = doc(db, 'musicRooms', roomId);
            const docSnap = await getDoc(roomRef);

            if (docSnap.exists()) {
                const roomData = docSnap.data();

                // 방 생성자이거나 슈퍼 관리자인 경우 접근 허용
                const userDocSnap = await getDoc(doc(db, 'users', user.uid));
                const userData = userDocSnap.exists() ? userDocSnap.data() : {};
                const isAdmin = userData.isAdmin === true || userData.isSuperAdmin === true || userData.role === 'admin';

                if (roomData.teacherId === user.uid || isAdmin) {
                    setRoom({ id: docSnap.id, ...roomData });
                    return { id: docSnap.id, ...roomData };
                } else {
                    alert("접근 권한이 없습니다.");
                    navigate('/learning-board/music-request');
                    return null;
                }
            } else {
                alert("존재하지 않는 방입니다.");
                navigate('/learning-board/music-request');
                return null;
            }
        },
        { interval: 30000, enabled: !!user, deps: [user, roomId] }
    );

    // Use polling for playlist
    const { refetch: refetchPlaylist } = usePolling(
        async () => {
            if (!room) return [];

            const q = query(collection(db, 'musicRooms', roomId, 'playlist'), orderBy('requestedAt', 'asc'));
            const querySnapshot = await getDocs(q);
            const newPlaylist = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlaylist(newPlaylist);
            return newPlaylist;
        },
        { interval: 5000, enabled: !!room, deps: [room, roomId] }
    );

    useEffect(() => {
        if (!user) {
            navigate('/login');
        }
    }, [user, navigate]);

    useEffect(() => {
        if (playlist.length > 0) {
            if (playlist[0].videoId !== currentVideoId) {
                setCurrentVideoId(playlist[0].videoId);
            }
        } else {
            setCurrentVideoId(null);
        }
    }, [playlist, currentVideoId]);

    const onStateChange = (event) => {
        if (event.data === 0) {
            playNextSong();
        }
    };
    
    const playNextSong = async () => {
        if (playlist.length > 0) {
            const playedSongId = playlist[0].id;
            await deleteDoc(doc(db, 'musicRooms', roomId, 'playlist', playedSongId));
            refetchPlaylist();
        }
    };
    
    const deleteRoom = async () => {
        if (window.confirm("정말로 이 방을 삭제하시겠습니까? 모든 재생목록이 사라집니다.")) {
            try {
                const playlistQuery = query(collection(db, 'musicRooms', roomId, 'playlist'));
                const playlistSnapshot = await getDocs(playlistQuery);
                const deletePromises = playlistSnapshot.docs.map((docSnapshot) => deleteDoc(docSnapshot.ref));
                await Promise.all(deletePromises);

                await deleteDoc(doc(db, 'musicRooms', roomId));
                refetchRoom();
                alert('방이 삭제되었습니다.');
                navigate('/learning-board/music-request');
            } catch (error) {
                console.error("Error deleting room: ", error);
                alert('방을 삭제하는 중 오류가 발생했습니다.');
            }
        }
    };
    
    const getRoomUrl = () => {
        return `${window.location.origin}/student-request/${roomId}`;
    };

    const opts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
        },
    };

    if (!room) return <div>로딩 중...</div>;

    return (
        <div className="music-room-container-grid">
            <div className="main-content">
                <div className="video-player-wrapper">
                    {currentVideoId ? (
                        <YouTube videoId={currentVideoId} opts={opts} onStateChange={onStateChange} className="youtube-player" />
                    ) : (
                        <div className="no-video-placeholder">
                            <p>재생목록이 비어있습니다. 학생들에게 음악을 신청하도록 해주세요.</p>
                        </div>
                    )}
                </div>
                <div className="room-header">
                    <h2>{room.name}</h2>
                    <div className="room-controls">
                        <button onClick={playNextSong} className="control-btn" disabled={playlist.length === 0}>다음 곡</button>
                        <button onClick={deleteRoom} className="delete-room-btn">방 삭제</button>
                    </div>
                </div>
            </div>
            <div className="sidebar-content">
                <div className="share-info-panel">
                    <h4>음악 신청 QR</h4>
                    <div className="qr-code-container-room">
                        <QRCodeSVG value={getRoomUrl()} size={120} />
                    </div>
                    <p className="room-link-title">공유 링크</p>
                    <p className="room-link-box">{getRoomUrl()}</p>
                </div>
                <div className="playlist-panel">
                    <h3>재생 목록 ({playlist.length}곡)</h3>
                    {playlist.length > 0 ? (
                        <ul className="playlist">
                            {playlist.map((song, index) => (
                                <li key={song.id} className={index === 0 ? 'playing' : ''}>
                                    <span className="song-title">{index + 1}. {song.title}</span>
                                    <span className="requester">신청: {song.requesterName}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="no-playlist-message">
                            <p>아직 신청된 곡이 없습니다.</p>
                            <p>학생들에게 QR 코드를 공유해주세요!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MusicRoom;