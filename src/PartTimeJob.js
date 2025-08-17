// src/PartTimeJob.js
import React, { useState } from "react";
import "./PartTimeJob.css"; // 방금 만든 CSS 파일을 임포트합니다.

// 임시 데이터 (실제로는 서버에서 받아와야 합니다)
const initialJobs = [
  {
    id: 1,
    title: "도서관 연체 도서 반납하기",
    reward: 5000,
    poster: "관리자",
    status: "available", // available, in-progress, completed
    acceptor: null,
  },
  {
    id: 2,
    title: "1층 로비 화분에 물 주기",
    reward: 3000,
    poster: "김민준",
    status: "available",
    acceptor: null,
  },
  {
    id: 3,
    title: "컴퓨터실 A 백업 작업",
    reward: 15000,
    poster: "관리자",
    status: "in-progress",
    acceptor: "박서연",
  },
];

// 현재 로그인한 사용자를 가정합니다. (실제 앱에서는 AuthContext 등에서 가져옵니다)
const currentUser = {
  name: "이하은", // 이 이름을 바꿔가며 테스트 해보세요! (예: '박서연', '김민준')
};

export default function PartTimeJob() {
  const [jobs, setJobs] = useState(initialJobs);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobReward, setNewJobReward] = useState("");

  // 아르바이트 등록 처리 함수
  const handlePostJob = (e) => {
    e.preventDefault();
    if (!newJobTitle || !newJobReward) {
      alert("모든 항목을 입력해주세요.");
      return;
    }

    const newJob = {
      id: Date.now(), // 고유 ID 생성
      title: newJobTitle,
      reward: parseInt(newJobReward, 10),
      poster: currentUser.name,
      status: "available",
      acceptor: null,
    };

    setJobs([newJob, ...jobs]); // 새 작업을 목록 맨 위에 추가
    setNewJobTitle("");
    setNewJobReward("");
  };

  // 아르바이트 수락 함수
  const handleAcceptJob = (jobId) => {
    setJobs(
      jobs.map((job) =>
        job.id === jobId
          ? { ...job, status: "in-progress", acceptor: currentUser.name }
          : job
      )
    );
    alert(
      `'${jobs.find((j) => j.id === jobId).title}' 아르바이트를 수락했습니다!`
    );
  };

  // 알바비 지급 함수
  const handlePayReward = (jobId) => {
    const jobToPay = jobs.find((job) => job.id === jobId);
    if (
      window.confirm(
        `'${
          jobToPay.acceptor
        }'님에게 ${jobToPay.reward.toLocaleString()}원을 지급하시겠습니까?`
      )
    ) {
      setJobs(jobs.filter((job) => job.id !== jobId)); // 지급 완료된 작업은 목록에서 제거
      alert("지급이 완료되었습니다.");
    }
  };

  // 각 জব 카드에 표시될 버튼/상태를 결정하는 함수
  const renderJobAction = (job) => {
    // 내가 올린 아르바이트인 경우
    if (job.poster === currentUser.name) {
      if (job.status === "available") {
        return <div className="status-info">수락 대기중</div>;
      }
      if (job.status === "in-progress") {
        return (
          <button
            className="job-btn pay-btn"
            onClick={() => handlePayReward(job.id)}
          >
            완료 및 알바비 지급
          </button>
        );
      }
    }
    // 다른 사람이 올린 아르바이트인 경우
    else {
      if (job.status === "available") {
        return (
          <button
            className="job-btn accept-btn"
            onClick={() => handleAcceptJob(job.id)}
          >
            수락하기
          </button>
        );
      }
      if (job.status === "in-progress" && job.acceptor === currentUser.name) {
        return <div className="status-inprogress">임무 수행중...</div>;
      }
    }

    return null; // 그 외의 경우 (예: 다른 사람이 수락한 경우)는 아무것도 표시하지 않음
  };

  return (
    <div className="part-time-job-container">
      <header className="part-time-job-header">
        <h2>오늘의 아르바이트 📝</h2>
        <p>간단한 임무를 수행하고 리워드를 획득하세요!</p>
      </header>

      <section className="job-posting-form">
        <h3>✨ 새로운 아르바이트 등록하기</h3>
        <form onSubmit={handlePostJob}>
          <div className="form-group">
            <label htmlFor="job-title">무엇을 해야 하나요?</label>
            <input
              type="text"
              id="job-title"
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              placeholder="예: 3층 복도 청소"
            />
          </div>
          <div className="form-group">
            <label htmlFor="job-reward">얼마를 지급할 건가요? (원)</label>
            <input
              type="number"
              id="job-reward"
              value={newJobReward}
              onChange={(e) => setNewJobReward(e.target.value)}
              placeholder="예: 5000"
            />
          </div>
          <button type="submit" className="post-job-btn">
            등록하기
          </button>
        </form>
      </section>

      <section className="job-list-section">
        <h3>실시간 아르바이트 목록</h3>
        <div className="job-list">
          {jobs
            .filter((job) => {
              // '진행중'인 아르바이트는 등록자와 수락자에게만 보임
              if (job.status === "in-progress") {
                return (
                  job.poster === currentUser.name ||
                  job.acceptor === currentUser.name
                );
              }
              // '모집중'인 아르바이트는 모두에게 보임
              return true;
            })
            .map((job) => (
              <div className="job-card" key={job.id}>
                <div>
                  <div className="job-card-header">
                    <h4 className="job-title">{job.title}</h4>
                    <p className="job-poster">등록자: {job.poster}</p>
                  </div>
                  <div className="job-reward">
                    {job.reward.toLocaleString()} <span>원</span>
                  </div>
                </div>
                <div className="job-actions">{renderJobAction(job)}</div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
