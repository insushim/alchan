/* eslint-disable */
/**
 * GitHub Actions에서 직접 호출 가능한 스케줄러 함수들
 * index.js에서 import하여 사용
 */

// index.js를 require하여 필요한 함수들 가져오기
const functions = require('./index');

// 주의: index.js의 onSchedule exports는 직접 호출할 수 없으므로
// 이 파일은 placeholder입니다.
// 실제 구현은 옵션 1 (HTTP 엔드포인트)를 사용하는 것이 더 간단합니다.

module.exports = {
  // Placeholder functions
  // 실제로는 HTTP 엔드포인트로 변경하는 것을 권장합니다
};
