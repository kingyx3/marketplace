export interface AdminActionResult {
  status: "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
}

export interface AdminActionConfirmation {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  requireText?: string;
}
