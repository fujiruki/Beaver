export const LINE_ITEM_NO_WIDTH = 42;
export const LINE_ITEM_LEFT_WIDTH = 330;
export const LINE_ITEM_BAND_LABEL_WIDTH = 67;
export const LINE_ITEM_MONEY_COLUMN_WIDTH = 72;
export const LINE_ITEM_TIME_COLUMN_WIDTH = 54;
export const LINE_ITEM_LABOR_RATE_WIDTH = 72;
export const LINE_ITEM_RESULT_WIDTH = 330;
export const LINE_ITEM_PROFIT_WIDTH = 118;
export const LINE_TYPE_SELECT_WIDTH = 72;

export function createCategoryGridTemplate(moneyCategoryCount: number, timeCategoryCount: number) {
  return [
    `${LINE_ITEM_BAND_LABEL_WIDTH}px`,
    ...Array(moneyCategoryCount).fill(`${LINE_ITEM_MONEY_COLUMN_WIDTH}px`),
    ...Array(timeCategoryCount).fill(`${LINE_ITEM_TIME_COLUMN_WIDTH}px`),
    `${LINE_ITEM_LABOR_RATE_WIDTH}px`,
    `${LINE_ITEM_RESULT_WIDTH}px`,
  ].join(' ');
}

export function getLineItemRightWidth(moneyCategoryCount: number, timeCategoryCount: number) {
  return LINE_ITEM_BAND_LABEL_WIDTH
    + moneyCategoryCount * LINE_ITEM_MONEY_COLUMN_WIDTH
    + timeCategoryCount * LINE_ITEM_TIME_COLUMN_WIDTH
    + LINE_ITEM_LABOR_RATE_WIDTH
    + LINE_ITEM_RESULT_WIDTH;
}

export function getLineItemWidth(moneyCategoryCount: number, timeCategoryCount: number) {
  return LINE_ITEM_NO_WIDTH
    + LINE_ITEM_LEFT_WIDTH
    + getLineItemRightWidth(moneyCategoryCount, timeCategoryCount)
    + LINE_ITEM_PROFIT_WIDTH;
}
