// src/BankingProductService.js
import { convertAdminProductsToAccountFormat } from "./BankingProductAdapter";

/**
 * 뱅킹 상품 정보를 가져오고 관리하는 서비스
 */
export class BankingProductService {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.products = null;
  }

  /**
   * 전체 상품 목록을 가져옵니다.
   *
   * @returns {Promise<Array>} - 상품 목록
   */
  async getAllProducts() {
    if (this.products) {
      return this.products;
    }

    try {
      const response = await this.apiClient.get("/banking/products");
      this.products = convertAdminProductsToAccountFormat(response.data);
      return this.products;
    } catch (error) {
      console.error("상품 목록을 가져오는데 실패했습니다:", error);
      return [];
    }
  }

  /**
   * 상품 유형에 따라 필터링된 상품 목록을 가져옵니다.
   *
   * @param {string} productType - 상품 유형 ('deposit', 'savings', 'loan')
   * @returns {Promise<Array>} - 필터링된 상품 목록
   */
  async getProductsByType(productType) {
    const allProducts = await this.getAllProducts();
    return allProducts.filter((product) => product.productType === productType);
  }

  /**
   * 상품 ID로 특정 상품 정보를 가져옵니다.
   *
   * @param {string|number} productId - 상품 ID
   * @returns {Promise<Object|null>} - 상품 정보
   */
  async getProductById(productId) {
    const allProducts = await this.getAllProducts();
    return (
      allProducts.find(
        (product) => product.id.toString() === productId.toString()
      ) || null
    );
  }
}
