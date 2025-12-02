// src/components/PageWrapper.js
// 페이지 공통 래퍼 - 일관된 스타일 및 로딩 처리

import React from 'react';
import { Loader2 } from 'lucide-react';

// 페이지 컨테이너
export const PageContainer = ({ children, className = '' }) => (
  <div className={`min-h-full ${className}`}>
    {children}
  </div>
);

// 페이지 헤더
export const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  action,
  backButton,
  className = '',
}) => (
  <div className={`mb-6 ${className}`}>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {backButton}
        {Icon && (
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
            <Icon className="w-6 h-6 text-indigo-500" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  </div>
);

// 섹션 제목
export const SectionTitle = ({ children, icon: Icon, action, className = '' }) => (
  <div className={`flex items-center justify-between mb-4 ${className}`}>
    <div className="flex items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-gray-400" />}
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{children}</h2>
    </div>
    {action}
  </div>
);

// 로딩 상태
export const LoadingState = ({ message = '데이터를 불러오는 중...' }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
    <p className="text-gray-500 dark:text-gray-400 font-medium">{message}</p>
  </div>
);

// 에러 상태
export const ErrorState = ({ title = '오류가 발생했습니다', message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
      <span className="text-3xl">!</span>
    </div>
    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
    {message && <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md">{message}</p>}
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
      >
        다시 시도
      </button>
    )}
  </div>
);

// 빈 상태
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && (
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
    )}
    {title && (
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
    )}
    {description && (
      <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">{description}</p>
    )}
    {action}
  </div>
);

// 카드 그리드
export const CardGrid = ({ children, cols = 3, className = '' }) => {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${colsClass[cols] || colsClass[3]} gap-4 ${className}`}>
      {children}
    </div>
  );
};

// 통계 카드
export const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  iconBg = 'bg-indigo-100 dark:bg-indigo-900/50',
  iconColor = 'text-indigo-500',
  onClick,
}) => (
  <div
    className={`bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 border border-gray-100 dark:border-gray-700 shadow-sm ${
      onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all' : ''
    }`}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-xl ${iconBg}`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      {trend && (
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          trend.type === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }`}>
          {trend.type === 'up' ? '+' : '-'}{trend.value}%
        </span>
      )}
    </div>
    <div className="mt-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      {subValue && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{subValue}</p>
      )}
    </div>
  </div>
);

// 탭 컴포넌트
export const TabGroup = ({ tabs, activeTab, onChange, className = '' }) => (
  <div className={`flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl ${className}`}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
          activeTab === tab.id
            ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {tab.icon && <tab.icon className="w-4 h-4 mr-2 inline-block" />}
        {tab.label}
        {tab.count !== undefined && (
          <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
            activeTab === tab.id
              ? 'bg-indigo-100 text-indigo-600'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
          }`}>
            {tab.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

// 액션 버튼
export const ActionButton = ({
  children,
  icon: Icon,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  className = '',
}) => {
  const variants = {
    primary: 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-md hover:shadow-lg',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200',
    outline: 'border-2 border-indigo-500 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
    danger: 'bg-red-500 hover:bg-red-600 text-white shadow-md',
    success: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md',
    ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      {children}
    </button>
  );
};

// 정보 배지
export const InfoBadge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    primary: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

// 알림 배너
export const AlertBanner = ({ children, variant = 'info', icon: Icon, onClose, className = '' }) => {
  const variants = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
    danger: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${variants[variant]} ${className}`}>
      {Icon && <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 text-sm">{children}</div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-50 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
};

// 리스트 아이템
export const ListItem = ({ children, icon: Icon, onClick, active, className = '' }) => (
  <div
    className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
      onClick ? 'cursor-pointer' : ''
    } ${
      active
        ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700'
        : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
    } ${className}`}
    onClick={onClick}
  >
    {Icon && (
      <div className={`p-2 rounded-lg ${active ? 'bg-indigo-100 dark:bg-indigo-800' : 'bg-gray-100 dark:bg-gray-700'}`}>
        <Icon className={`w-5 h-5 ${active ? 'text-indigo-600' : 'text-gray-500'}`} />
      </div>
    )}
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

// 금액 표시
export const MoneyDisplay = ({ amount, size = 'md', showSign = false, className = '' }) => {
  const formatted = Math.abs(amount || 0).toLocaleString('ko-KR');
  const isNegative = amount < 0;
  const isPositive = amount > 0;

  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl',
  };

  return (
    <span className={`font-bold tabular-nums ${sizes[size]} ${
      isNegative ? 'text-red-500' : isPositive && showSign ? 'text-emerald-500' : 'text-gray-900 dark:text-white'
    } ${className}`}>
      {showSign && isPositive && '+'}
      {isNegative && '-'}
      {formatted}원
    </span>
  );
};

export default {
  PageContainer,
  PageHeader,
  SectionTitle,
  LoadingState,
  ErrorState,
  EmptyState,
  CardGrid,
  StatCard,
  TabGroup,
  ActionButton,
  InfoBadge,
  AlertBanner,
  ListItem,
  MoneyDisplay,
};
