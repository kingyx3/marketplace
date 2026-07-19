"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { AdminFileField } from "@/app/(shop)/control/_components/admin-form-fields";
import { ApiClientError, createApiClient } from "@/lib/api/client";
import { createBrowserSessionProvider } from "@/lib/auth/browser-session";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  formatProductImageLimit,
  isProductImageContentType,
} from "@/lib/catalog-product-images";

type UploadPhase = "idle" | "requesting" | "uploading" | "finalizing" | "success" | "error";

interface SignedUploadResponse {
  path: string;
  uploadUrl: string;
  maxSizeBytes: number;
}

export function ProductImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const session = useMemo(
    () =>
      createBrowserSessionProvider(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
      ),
    []
  );
  const api = useMemo(
    () =>
      createApiClient({
        getAccessToken: () => session.getAccessToken(),
        onUnauthorized: () => router.push("/sign-in?next=/control/operations"),
        timeoutMs: 30_000,
      }),
    [router, session]
  );
  const busy = ["requesting", "uploading", "finalizing"].includes(phase);

  async function submitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const image = new FormData(form).get("image");
    if (!(image instanceof File) || image.size === 0) {
      setPhase("error");
      setMessage("Choose a product image to upload.");
      return;
    }
    if (!isProductImageContentType(image.type)) {
      setPhase("error");
      setMessage("Use a JPG, PNG, WebP, or AVIF image.");
      return;
    }
    if (image.size > MAX_PRODUCT_IMAGE_BYTES) {
      setPhase("error");
      setMessage(`Product images must be ${formatProductImageLimit()} or smaller.`);
      return;
    }

    try {
      setPhase("requesting");
      setMessage("Preparing a secure upload…");
      const signedUpload = await api.request<SignedUploadResponse>(
        "/api/control/product-image-upload",
        {
          method: "POST",
          body: {
            productId,
            contentType: image.type,
            sizeBytes: image.size,
          },
        }
      );

      if (image.size > signedUpload.maxSizeBytes) {
        throw new Error("Product image exceeds the server upload limit.");
      }

      setPhase("uploading");
      setMessage("Uploading image directly to storage…");
      await uploadToSignedUrl(signedUpload.uploadUrl, image);

      setPhase("finalizing");
      setMessage("Saving the product image…");
      await api.request<{ publicUrl: string }>("/api/control/product-image-upload", {
        method: "PATCH",
        body: { productId, path: signedUpload.path },
      });

      form.reset();
      setPhase("success");
      setMessage("Product image uploaded successfully.");
      router.refresh();
    } catch (error) {
      setPhase("error");
      setMessage(uploadErrorMessage(error));
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={submitImage}>
      <AdminFileField
        accept="image/jpeg,image/png,image/webp,image/avif"
        disabled={busy}
        example="destined-rivals-booster-box.jpg"
        hint={`Choose a JPG, PNG, WebP, or AVIF image up to ${formatProductImageLimit()}. The file uploads directly to protected storage.`}
        label="Product image"
        name="image"
        required
      />
      <button
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={busy}
        type="submit"
      >
        {busy ? "Uploading…" : "Upload image"}
      </button>
      {message ? (
        <p
          aria-live="polite"
          className={`text-xs sm:col-span-2 ${phase === "error" ? "text-rose-700" : "text-zinc-600"}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

async function uploadToSignedUrl(uploadUrl: string, image: File): Promise<void> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("upload_timeout"), 120_000);

  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Cache-Control": "3600",
        "Content-Type": image.type,
      },
      body: image,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Storage rejected the image upload (${response.status}).`);
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.requestId
      ? `${error.message} Error reference: ${error.requestId}`
      : error.message;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The image upload timed out. Try again with a smaller file or a more stable connection.";
  }
  return error instanceof Error ? error.message : "Product image upload failed. Please try again.";
}
