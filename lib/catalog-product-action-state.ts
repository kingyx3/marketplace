export interface CatalogProductActionState {
  status: "idle" | "success" | "error";
  message: string;
  field?:
    | "name"
    | "category"
    | "categorySlug"
    | "set"
    | "setCode"
    | "productType"
    | "productIdentity";
}

export const initialCatalogProductActionState: CatalogProductActionState = {
  status: "idle",
  message: "",
};
