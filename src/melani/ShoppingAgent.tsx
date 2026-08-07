/**
 * Shop page — 52-week buy calendar from locked meals.
 * (Old XP / aisle-run UI removed — Melani wants dates + colors only.)
 */
import { MealsShop } from "./MealsShop";
import "./shopping-agent.css";
import "./meals-shop.css";

export function ShoppingAgent() {
  return (
    <div className="shop-agent">
      <MealsShop />
    </div>
  );
}

export function isShoppingAgentPage(pageId: string) {
  return pageId === "pg-agent-shopping";
}
