// src/numberFormatter.js

/**
 * 숫자를 한국 단위 (만, 억, 조 등)로 포맷팅합니다.
 * @param {number} number - 포맷팅할 숫자.
 * @param {string} unit - 숫자 뒤에 붙일 단위 문자열 (예: '원', '개'). 기본값은 빈 문자열입니다.
 * @returns {string} 한국 단위로 포맷팅된 문자열.
 */
export const formatKoreanNumber = (number, unit = "") => {
  if (number === null || number === undefined) {
    return "";
  }

  // 숫자가 0이면 그냥 0과 단위만 반환
  if (number === 0) {
    return "0" + unit;
  }

  // 음수 처리
  const isNegative = number < 0;
  const absNumber = Math.abs(number);
  let result = "";

  const units = [
    { value: 1e12, unitName: "조" }, // 1조
    { value: 1e8, unitName: "억" }, // 1억
    { value: 1e4, unitName: "만" }, // 1만
  ];

  let remaining = absNumber;

  for (const { value, unitName } of units) {
    if (remaining >= value) {
      const quotient = Math.floor(remaining / value);
      result += quotient.toLocaleString() + unitName;
      remaining %= value; // 나머지 계산
    }
  }

  // 만 단위보다 작은 나머지 처리
  if (remaining > 0) {
    // 남은 숫자에 콤마 포맷팅
    result +=
      (remaining > 0 && result !== "" ? " " : "") + remaining.toLocaleString();
  } else if (result === "") {
    // 1만보다 작지만 0은 아닌 경우
    result = absNumber.toLocaleString();
  }

  // 단위 문자열 추가 (remaining이 0이 아니고 단위가 지정되었거나, remaining은 0이지만 result가 비어있지 않을 때)
  if (unit && (remaining > 0 || result !== "")) {
    result += unit;
  } else if (unit && result === "") {
    // 예를 들어 숫자가 0인데 단위가 있다면 "0원"처럼 표시
    result = "0" + unit;
  }

  // 음수 부호 붙이기
  if (isNegative) {
    result = "-" + result;
  }

  return result;
};

/**
 * 금액을 한국식 통화 형식으로 포맷팅합니다 ('원' 단위 사용)
 * @param {number} number - 포맷팅할 금액
 * @returns {string} 포맷팅된 통화 문자열
 */
export const formatKoreanCurrency = (number) => {
  if (number === null || number === undefined) {
    return "";
  }
  // 숫자인지 확인하고 아니면 그대로 반환
  if (typeof number !== "number") {
    // '원' 문자열이 붙어있을 경우 제거하고 숫자로 변환 시도
    const numStr = String(number).replace(/원/g, "").replace(/,/g, "");
    const parsedNum = parseInt(numStr);
    if (!isNaN(parsedNum)) {
      number = parsedNum;
    } else {
      return String(number); // 숫자가 아니면 원본 문자열 반환
    }
  }

  return formatKoreanNumber(number, "원");
};

/**
 * 대안: Intl API를 사용한 한국식 통화 형식 포맷팅 (₩ 기호 포함)
 * @param {number} amount - 포맷팅할 금액
 * @returns {string} 포맷팅된 통화 문자열
 */
export const formatKoreanCurrencyWithSymbol = (amount) => {
  // 예외 처리
  if (amount === null || amount === undefined) return "₩0";

  // 한국 통화 기호와 천 단위 구분자로 숫자 포맷팅
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    currencyDisplay: "symbol",
  }).format(amount);
};

/**
 * 쿠폰 등 수량 포맷팅을 위한 헬퍼 함수 (단위 없음)
 * @param {number} number - 포맷팅할 수량
 * @returns {string} 포맷팅된 수량 문자열
 */
export const formatKoreanQuantity = (number) => {
  if (number === null || number === undefined) {
    return "";
  }
  // 숫자인지 확인하고 아니면 그대로 반환
  if (typeof number !== "number") {
    const parsedNum = parseInt(String(number).replace(/,/g, ""));
    if (!isNaN(parsedNum)) {
      number = parsedNum;
    } else {
      return String(number); // 숫자가 아니면 원본 문자열 반환
    }
  }
  return formatKoreanNumber(number); // 단위 없이 포맷팅
};
