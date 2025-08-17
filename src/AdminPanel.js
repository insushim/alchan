// src/AdminPanel.js
import React, { useState, useEffect } from "react";
import { useItems } from "./ItemContext";
// import "./AdminPanel.css"; // CSS는 아래 별도 파일로 제공

/**
 * 관리자 패널 컴포넌트
 * 아이템 관리 및 설정을 위한 인터페이스 제공
 */
const AdminPanel = ({
  onClose,
  editingItemFromStore,
  onAddItem,
  onUpdateItem,
  priceIncreasePercentage: externalPriceIncreasePercentage,
  onPriceIncreaseChange: externalPriceIncreaseChange,
}) => {
  const {
    items,
    adminPriceIncreasePercentage,
    setAdminPriceIncrease,
    addItem: contextAddItem,
    updateItem: contextUpdateItem,
  } = useItems() || {
    items: [],
    adminPriceIncreasePercentage: 10,
    setAdminPriceIncrease: () =>
      console.error("setAdminPriceIncrease is not available"),
    addItem: () => console.error("addItem is not available"),
    updateItem: () => console.error("updateItem is not available"),
  };

  const addItemFunction = onAddItem || contextAddItem;
  const updateItemFunction = onUpdateItem || contextUpdateItem;
  const setPriceIncreaseFunction =
    externalPriceIncreaseChange || setAdminPriceIncrease;

  const [activeTab, setActiveTab] = useState(
    editingItemFromStore ? "edit" : "items"
  );
  const [globalPriceIncrease, setGlobalPriceIncrease] = useState(
    externalPriceIncreasePercentage ?? adminPriceIncreasePercentage ?? 10
  );

  const iconOptions = [
    "🔮",
    "🧪",
    "💧",
    "🧨",
    "🔥",
    "⚡",
    "🌟",
    "🌈",
    "🍄",
    "🥤",
    "🗡️",
    "🛡️",
    "💎",
    "📜",
    "🧿",
    "🔱",
    "✏️",
    "🧽",
    "🆕",
    "📚",
    "🎯",
    "🎁",
    "⚔️",
    "🔋",
    "🔑",
    "🎭",
    "🎨",
    "🏆",
    "🎵",
    "🎮",
    "💻",
    "📱",
    "🚀",
    "💡",
    "⚙️",
    "🔩",
    "💣",
    "💰",
    "📈",
    "📉",
    "📊",
    "🔔",
    "🔊",
    "📡",
    "🔭",
    "🔬",
    "🧬",
    "🌡️",
    "🩹",
    "🧱",
    "⚙",
    "🔩",
    "🧲",
    "⚗️",
    "⚖️",
    "🛠️",
    "📈",
    "📉", // 약 50개 + @
  ];

  const initialNewItemState = {
    name: "",
    description: "",
    price: 100,
    initialStock: 10,
    stock: 10,
    icon: "🔮",
    available: true,
    outOfStockPriceIncreaseRate: 10, // 기본 인상률 10%
  };
  const [newItem, setNewItem] = useState(initialNewItemState);
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    if (editingItemFromStore) {
      setEditingItem({
        ...editingItemFromStore,
        stock:
          editingItemFromStore.stock ?? editingItemFromStore.initialStock ?? 0,
        outOfStockPriceIncreaseRate:
          editingItemFromStore.outOfStockPriceIncreaseRate ?? 10, // 수정 시 기본값 10%
      });
      setActiveTab("edit");
    } else {
      setEditingItem(null);
    }
  }, [editingItemFromStore]);

  useEffect(() => {
    if (externalPriceIncreasePercentage !== undefined) {
      setGlobalPriceIncrease(externalPriceIncreasePercentage);
    }
  }, [externalPriceIncreasePercentage]);

  const changeTab = (tabName) => {
    setActiveTab(tabName);
    if (tabName === "add") {
      setEditingItem(null);
      setNewItem(initialNewItemState);
    }
  };

  const startEditing = (item) => {
    setEditingItem({
      ...item,
      stock: item.stock ?? item.initialStock ?? 0,
      outOfStockPriceIncreaseRate: item.outOfStockPriceIncreaseRate ?? 10, // 편집 시작 시 기본값 10%
    });
    setActiveTab("edit");
  };

  const cancelEditing = () => {
    setEditingItem(null);
    setActiveTab("items");
  };

  const handleEditFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue =
      type === "checkbox"
        ? checked
        : type === "number"
        ? parseFloat(value) || 0
        : value;
    setEditingItem((prev) => (prev ? { ...prev, [name]: newValue } : null));
  };

  const saveItemEdit = () => {
    if (!editingItem || !updateItemFunction)
      return alert("아이템 수정 중 오류 발생");
    if (
      !editingItem.name ||
      editingItem.price <= 0 ||
      editingItem.initialStock < 0 ||
      editingItem.stock < 0 ||
      editingItem.outOfStockPriceIncreaseRate < 0
    ) {
      return alert(
        "이름, 가격(1 이상), 재고(0 이상), 인상률(0 이상)을 올바르게 입력하세요."
      );
    }

    if (updateItemFunction(editingItem) !== false) {
      alert("아이템 수정 완료!");
      setEditingItem(null);
      setActiveTab("items");
      if (onClose) onClose();
    } else {
      alert("아이템 수정 실패");
    }
  };

  const handleNewFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue =
      type === "checkbox"
        ? checked
        : type === "number"
        ? parseFloat(value) || 0
        : value;
    setNewItem((prev) => {
      const updated = { ...prev, [name]: newValue };
      if (name === "initialStock") updated.stock = parseFloat(newValue) || 0;
      return updated;
    });
  };

  const handleAddItem = () => {
    if (!addItemFunction) return alert("아이템 추가 기능 사용 불가");
    if (
      !newItem.name ||
      newItem.price <= 0 ||
      newItem.initialStock < 0 ||
      newItem.outOfStockPriceIncreaseRate < 0
    ) {
      return alert(
        "이름, 가격(1 이상), 초기 재고(0 이상), 인상률(0 이상)을 올바르게 입력하세요."
      );
    }

    const newItemData = {
      ...newItem,
      stock: newItem.initialStock, // 새 아이템 추가시 stock은 initialStock과 동일
    };

    const newItemId = addItemFunction(newItemData);
    if (newItemId !== false && newItemId !== undefined) {
      alert("새 아이템 추가 완료!");
      setNewItem(initialNewItemState);
      setActiveTab("items");
      if (onClose) onClose();
    } else {
      alert("아이템 추가 실패");
    }
  };

  const cancelAddItem = () => {
    setNewItem(initialNewItemState);
    setActiveTab("items");
  };

  const saveGlobalPriceIncrease = () => {
    if (!setPriceIncreaseFunction) return alert("설정 저장 기능 사용 불가");
    const value = parseFloat(globalPriceIncrease);
    if (!isNaN(value) && value >= 0) {
      setPriceIncreaseFunction(value);
      alert("전체 가격 인상률 저장됨");
    } else {
      alert("유효한 가격 인상률(0 이상 숫자) 입력 필요");
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-tabs">
        <button
          className={activeTab === "items" ? "active" : ""}
          onClick={() => changeTab("items")}
        >
          아이템 관리
        </button>
        <button
          className={activeTab === "settings" ? "active" : ""}
          onClick={() => changeTab("settings")}
        >
          전체 설정
        </button>
        <button
          className={activeTab === "add" ? "active" : ""}
          onClick={() => changeTab("add")}
        >
          새 아이템 추가
        </button>
        {activeTab === "edit" && (
          <button className="active" disabled>
            아이템 수정
          </button>
        )}
      </div>

      <div className="admin-content">
        {activeTab === "items" && (
          <div className="items-management">
            <h3>아이템 목록</h3>
            <button className="add-item-btn" onClick={() => changeTab("add")}>
              새 아이템 추가 +
            </button>
            <div className="items-list">
              {Array.isArray(items) && items.length > 0 ? (
                items.map((item) => (
                  <div key={item.id} className="admin-item-card">
                    <div className="item-icon">{item.icon || "❓"}</div>
                    <div className="item-details">
                      <h4>{item.name}</h4>
                      <p>{item.description || "설명 없음"}</p>
                      <div className="item-meta">
                        <span>가격: {item.price?.toLocaleString() ?? 0}</span>
                        <span>
                          재고: {item.stock ?? 0} /{" "}
                          {item.initialStock ?? item.stock ?? 0}
                        </span>
                        <span>
                          상태: {item.available ? "판매중" : "판매중지"}
                        </span>
                        <span>
                          품절 시 인상률:{" "}
                          {item.outOfStockPriceIncreaseRate ?? 10}%
                        </span>
                      </div>
                    </div>
                    <div className="item-actions">
                      <button
                        className="edit-button"
                        onClick={() => startEditing(item)}
                        title="수정"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p>표시할 아이템이 없습니다.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="settings-panel">
            <h3>전체 관리자 설정</h3>
            <div className="setting-group">
              <label htmlFor="priceIncreaseInput">
                전체 재고 소진 시 기본 가격 인상률 (%)
              </label>
              <div className="input-with-button">
                <input
                  id="priceIncreaseInput"
                  type="number"
                  value={globalPriceIncrease}
                  onChange={(e) => setGlobalPriceIncrease(e.target.value)}
                  min="0"
                  step="0.1"
                  placeholder="예: 10"
                />
                <button onClick={saveGlobalPriceIncrease}>저장</button>
              </div>
              <p className="setting-description">
                아이템 재고가 0이 되면, 초기 재고로 복구되면서 가격이 설정된
                비율만큼 인상됩니다. (개별 아이템 인상률이 우선 적용됩니다.)
              </p>
            </div>
          </div>
        )}

        {activeTab === "add" && (
          <div className="add-item-panel">
            <h3>새 아이템 추가</h3>
            <form
              className="item-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddItem();
              }}
            >
              <div className="form-group">
                <label htmlFor="add-name">아이템 이름</label>
                <input
                  id="add-name"
                  name="name"
                  type="text"
                  value={newItem.name}
                  onChange={handleNewFormChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="add-desc">설명</label>
                <textarea
                  id="add-desc"
                  name="description"
                  value={newItem.description}
                  onChange={handleNewFormChange}
                />
              </div>
              <div className="form-row">
                <div className="form-group half">
                  <label htmlFor="add-price">가격</label>
                  <input
                    id="add-price"
                    name="price"
                    type="number"
                    value={newItem.price}
                    onChange={handleNewFormChange}
                    min="1"
                    step="any" // 소수점 허용
                    required
                  />
                </div>
                <div className="form-group half">
                  <label htmlFor="add-initialStock">초기 재고</label>
                  <input
                    id="add-initialStock"
                    name="initialStock"
                    type="number"
                    value={newItem.initialStock}
                    onChange={handleNewFormChange}
                    min="0"
                    step="any" // 소수점 허용
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="add-outOfStockPriceIncreaseRate">
                  재고 소진 시 가격 인상률 (%)
                </label>
                <input
                  id="add-outOfStockPriceIncreaseRate"
                  name="outOfStockPriceIncreaseRate"
                  type="number"
                  value={newItem.outOfStockPriceIncreaseRate}
                  onChange={handleNewFormChange}
                  min="0"
                  step="any" // 소수점 허용
                  required
                />
                <p className="setting-description">
                  이 아이템의 재고가 소진되면 설정된 비율만큼 가격이 인상됩니다.
                  (기본값: 10%)
                </p>
              </div>
              <div className="form-group">
                <label>아이콘</label>
                <div className="icon-selector">
                  {iconOptions.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      className={newItem.icon === icon ? "selected" : ""}
                      onClick={() => setNewItem({ ...newItem, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group checkbox">
                <label>
                  <input
                    name="available"
                    type="checkbox"
                    checked={newItem.available}
                    onChange={handleNewFormChange}
                  />
                  판매 가능
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={cancelAddItem}
                >
                  취소
                </button>
                <button type="submit" className="submit-button">
                  추가
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "edit" && editingItem && (
          <div className="edit-item-panel">
            <h3>아이템 수정</h3>
            <form
              className="item-form"
              onSubmit={(e) => {
                e.preventDefault();
                saveItemEdit();
              }}
            >
              <div className="form-group">
                <label htmlFor="edit-name">아이템 이름</label>
                <input
                  id="edit-name"
                  name="name"
                  type="text"
                  value={editingItem.name}
                  onChange={handleEditFormChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-desc">설명</label>
                <textarea
                  id="edit-desc"
                  name="description"
                  value={editingItem.description}
                  onChange={handleEditFormChange}
                />
              </div>
              <div className="form-row">
                <div className="form-group half">
                  <label htmlFor="edit-price">가격</label>
                  <input
                    id="edit-price"
                    name="price"
                    type="number"
                    value={editingItem.price}
                    onChange={handleEditFormChange}
                    min="1"
                    step="any" // 소수점 허용
                    required
                  />
                </div>
                <div className="form-group half">
                  <label htmlFor="edit-initialStock">초기 재고</label>
                  <input
                    id="edit-initialStock"
                    name="initialStock"
                    type="number"
                    value={editingItem.initialStock}
                    onChange={handleEditFormChange}
                    min="0"
                    step="any" // 소수점 허용
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="edit-stock">현재 재고</label>
                <input
                  id="edit-stock"
                  name="stock"
                  type="number"
                  value={editingItem.stock}
                  onChange={handleEditFormChange}
                  min="0"
                  step="any" // 소수점 허용
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-outOfStockPriceIncreaseRate">
                  재고 소진 시 가격 인상률 (%)
                </label>
                <input
                  id="edit-outOfStockPriceIncreaseRate"
                  name="outOfStockPriceIncreaseRate"
                  type="number"
                  value={editingItem.outOfStockPriceIncreaseRate}
                  onChange={handleEditFormChange}
                  min="0"
                  step="any" // 소수점 허용
                  required
                />
                <p className="setting-description">
                  이 아이템의 재고가 소진되면 설정된 비율만큼 가격이 인상됩니다.
                </p>
              </div>
              <div className="form-group">
                <label>아이콘</label>
                <div className="icon-selector">
                  {iconOptions.map((icon) => (
                    <button
                      type="button"
                      key={icon}
                      className={editingItem.icon === icon ? "selected" : ""}
                      onClick={() => setEditingItem({ ...editingItem, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group checkbox">
                <label>
                  <input
                    name="available"
                    type="checkbox"
                    checked={editingItem.available}
                    onChange={handleEditFormChange}
                  />
                  판매 가능
                </label>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={cancelEditing}
                >
                  취소
                </button>
                <button type="submit" className="submit-button">
                  저장
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
