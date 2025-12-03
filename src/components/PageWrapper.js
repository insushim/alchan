// src/components/PageWrapper.js
// 페이지 공통 래퍼 - 새로운 슬레이트 기반 디자인 시스템

import React from 'react';
import { Loader2, CheckSquare } from 'lucide-react';

// ============================================
// 페이지 컨테이너
// ============================================
export const PageContainer = ({ children, className = '' }) => (
  <div className={`min-h-full w-full bg-slate-50 ${className}`}>
    <div className="w-full max-w-none px-4 md:px-6 lg:px-8 py-4 md:py-6">
      {children}
    </div>
  </div>
);

// ============================================
// 페이지 헤더 - 새로운 디자인
// ============================================
export const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  action,
  backButton,
  className = '',
}) => (
  <section className={`bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 ${className}`}>
    <div className="flex items-center gap-4">
      {backButton}
      {Icon && (
        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0 shadow-sm border border-indigo-100">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && (
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && (
      <div className="flex flex-wrap items-center gap-3 md:ml-auto">
        {action}
      </div>
    )}
  </section>
);

// ============================================
// 섹션 제목
// ============================================
export const SectionTitle = ({ children, icon: Icon, action, className = '' }) => (
  <div className={`flex items-center justify-between px-1 mb-4 ${className}`}>
    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-slate-400" />}
      {children}
    </h3>
    {action}
  </div>
);

// ============================================
// 로딩 상태
// ============================================
export const LoadingState = ({ message = '데이터를 불러오는 중...' }) => (
  <div className="flex flex-col items-center justify-center py-16">
    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
    <p className="text-slate-500 font-medium">{message}</p>
  </div>
);

// ============================================
// 에러 상태
// ============================================
export const ErrorState = ({ title = '오류가 발생했습니다', message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
      <span className="text-3xl text-red-500">!</span>
    </div>
    <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
    {message && <p className="text-slate-500 mb-4 max-w-md">{message}</p>}
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm transition-all shadow-sm"
      >
        다시 시도
      </button>
    )}
  </div>
);

// ============================================
// 빈 상태
// ============================================
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && (
      <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 border border-slate-100">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
    )}
    {title && (
      <h3 className="text-lg font-bold text-slate-700 mb-2">{title}</h3>
    )}
    {description && (
      <p className="text-slate-500 font-medium mb-6 max-w-md">{description}</p>
    )}
    {action}
  </div>
);

// ============================================
// 카드 그리드
// ============================================
export const CardGrid = ({ children, cols = 3, className = '' }) => {
  const colsClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  };

  return (
    <div className={`grid ${colsClass[cols] || colsClass[3]} gap-6 ${className}`}>
      {children}
    </div>
  );
};

// ============================================
// 통계 카드 - 새로운 디자인
// ============================================
export const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  iconBg = 'bg-indigo-50',
  iconColor = 'text-indigo-600',
  onClick,
}) => (
  <div
    className={`bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 ${
      onClick ? 'cursor-pointer' : ''
    }`}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${iconBg}`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      {trend && (
        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
          trend.type === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }`}>
          {trend.type === 'up' ? '+' : '-'}{trend.value}%
        </span>
      )}
    </div>
    <div className="mt-4">
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</p>
      {subValue && (
        <p className="text-sm text-slate-400 mt-1">{subValue}</p>
      )}
    </div>
  </div>
);

// ============================================
// 자산 카드 - 헤더용
// ============================================
export const AssetCard = ({ icon: Icon, label, value, color, iconColor }) => (
  <div className={`hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-xl ${color} bg-opacity-50 border border-transparent`}>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${iconColor}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-[10px] font-bold opacity-70 mb-0 leading-tight">{label}</p>
      <p className="text-lg font-black tracking-tight leading-tight">{value}</p>
    </div>
  </div>
);

// ============================================
// 탭 컴포넌트
// ============================================
export const TabGroup = ({ tabs, activeTab, onChange, className = '' }) => (
  <div className={`flex gap-1 p-1 bg-slate-100 rounded-xl ${className}`}>
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${
          activeTab === tab.id
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {tab.icon && <tab.icon className="w-4 h-4 mr-2 inline-block" />}
        {tab.label}
        {tab.count !== undefined && (
          <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
            activeTab === tab.id
              ? 'bg-indigo-100 text-indigo-600'
              : 'bg-slate-200 text-slate-600'
          }`}>
            {tab.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

// ============================================
// 액션 버튼 - 새로운 디자인
// ============================================
export const ActionButton = ({
  children,
  icon: Icon,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  className = '',
  title,
}) => {
  const variants = {
    primary: 'bg-slate-800 text-white hover:bg-slate-900 ring-1 ring-slate-900 shadow-slate-200',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    outline: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 shadow-sm',
    'outline-green': 'bg-white text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-50 hover:ring-emerald-300 shadow-sm',
    'outline-red': 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 hover:ring-rose-300 shadow-sm',
    danger: 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 hover:ring-rose-300 shadow-sm',
    success: 'bg-white text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-50 hover:ring-emerald-300 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
    indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 active:scale-95 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
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

// ============================================
// 정보 배지
// ============================================
export const InfoBadge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    primary: 'bg-indigo-100 text-indigo-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

// ============================================
// 알림 배너
// ============================================
export const AlertBanner = ({ children, variant = 'info', icon: Icon, onClose, className = '' }) => {
  const variants = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    danger: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${variants[variant]} ${className}`}>
      {Icon && <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 text-sm font-medium">{children}</div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-50 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
};

// ============================================
// 리스트 아이템 / 할일 아이템
// ============================================
export const ListItem = ({ children, icon: Icon, onClick, active, className = '' }) => (
  <div
    className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
      onClick ? 'cursor-pointer' : ''
    } ${
      active
        ? 'bg-indigo-50 border border-indigo-200'
        : 'bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md'
    } ${className}`}
    onClick={onClick}
  >
    {Icon && (
      <div className={`p-2 rounded-lg ${active ? 'bg-indigo-100' : 'bg-slate-100'}`}>
        <Icon className={`w-5 h-5 ${active ? 'text-indigo-600' : 'text-slate-500'}`} />
      </div>
    )}
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

// ============================================
// 할일 아이템 - 새로운 디자인
// ============================================
export const TaskItem = ({ task, onComplete, onEdit, onDelete, showActions = true }) => (
  <div className="group flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-white hover:shadow-md transition-all">
    <div className="flex items-center gap-3 min-w-0">
      <div
        onClick={onComplete}
        className="w-5 h-5 rounded md:rounded-md border-2 border-slate-300 group-hover:border-indigo-500 cursor-pointer transition-colors flex items-center justify-center shrink-0"
      >
        {/* 체크박스 영역 */}
      </div>
      <span className="font-bold text-slate-700 text-base truncate group-hover:text-indigo-700 transition-colors">
        {task.name}
      </span>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      {task.rewardType === "random" && (
        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold flex items-center gap-1">
          🎁 랜덤
        </span>
      )}
      {showActions && (
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 text-slate-400 hover:text-blue-500 rounded hover:bg-blue-50"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50"
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

// ============================================
// 직업 카드 - 새로운 디자인
// ============================================
export const JobCard = ({ job, children, onEdit, onDelete, onAddTask }) => {
  const gradients = {
    indigo: 'from-indigo-500 to-purple-600',
    blue: 'from-blue-500 to-cyan-500',
    emerald: 'from-emerald-500 to-teal-600',
    orange: 'from-orange-400 to-red-500',
    pink: 'from-pink-500 to-rose-500',
    violet: 'from-violet-500 to-purple-600',
  };

  const gradient = job.color || gradients.indigo;

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 overflow-hidden flex flex-col">
      {/* 카드 헤더 */}
      <div className={`h-16 px-6 flex items-center justify-between bg-gradient-to-r ${gradient}`}>
        <h4 className="text-white font-bold text-lg tracking-wide flex items-center gap-2">
          👑 {job.title}
        </h4>
        {(onEdit || onDelete) && (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                ✏️
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {/* 할일 목록 */}
      <div className="p-6 space-y-4 flex-1">
        {children}
      </div>

      {/* 하단 버튼 */}
      {onAddTask && (
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={onAddTask}
            className="w-full py-3 rounded-xl bg-slate-50 text-slate-500 text-sm font-bold border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors flex items-center justify-center gap-2"
          >
            ➕ 이 직업에 할일 추가
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// 콘텐츠 섹션 카드
// ============================================
export const ContentSection = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 ${className}`}>
    {children}
  </div>
);

// ============================================
// 금액 표시
// ============================================
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
      isNegative ? 'text-red-500' : isPositive && showSign ? 'text-emerald-500' : 'text-slate-900'
    } ${className}`}>
      {showSign && isPositive && '+'}
      {isNegative && '-'}
      {formatted}원
    </span>
  );
};

// ============================================
// 빈 추가 카드
// ============================================
export const AddCard = ({ onClick, label = '새로 추가하기' }) => (
  <button
    onClick={onClick}
    className="group relative flex flex-col items-center justify-center h-full min-h-[260px] rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 hover:bg-indigo-50/50 hover:border-indigo-300 transition-all"
  >
    <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
      <span className="text-3xl text-slate-400 group-hover:text-indigo-500">➕</span>
    </div>
    <span className="text-slate-500 font-bold group-hover:text-indigo-600 text-sm">{label}</span>
  </button>
);

export default {
  PageContainer,
  PageHeader,
  SectionTitle,
  LoadingState,
  ErrorState,
  EmptyState,
  CardGrid,
  StatCard,
  AssetCard,
  TabGroup,
  ActionButton,
  InfoBadge,
  AlertBanner,
  ListItem,
  TaskItem,
  JobCard,
  ContentSection,
  MoneyDisplay,
  AddCard,
};
