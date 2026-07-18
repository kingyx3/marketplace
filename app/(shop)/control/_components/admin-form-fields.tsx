"use client";

import {
  useId,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

type Feedback = {
  tone: "error" | "success";
  message: string;
} | null;

type BaseFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  example: string;
  hint?: string;
  patternMessage?: string;
  externalError?: string;
};

type TextFieldProps = BaseFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name" | "onChange" | "required" | "value"> & {
    defaultValue?: string | number;
    value?: string;
    onValueChange?: (value: string) => void;
  };

type NumberFieldProps = Omit<TextFieldProps, "type">;

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = BaseFieldProps & {
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  optionalLabel?: string;
  onValueChange?: (value: string) => void;
};

type TextareaFieldProps = BaseFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue" | "name" | "onChange" | "required" | "value"> & {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  };

type FileFieldProps = BaseFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "required" | "type">;

export function AdminTextField({
  label,
  name,
  required = false,
  example,
  hint,
  patternMessage,
  externalError,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  className,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const message = externalError
    ? { tone: "error" as const, message: externalError }
    : feedback;

  function validate(element: HTMLInputElement, showSuccess: boolean) {
    setFeedback(validationFeedback(element, label, patternMessage, showSuccess));
  }

  return (
    <FieldFrame
      example={example}
      feedback={message}
      hint={hint}
      id={id}
      label={label}
      required={required}
    >
      <input
        {...inputProps}
        aria-describedby={`${id}-help ${id}-feedback`}
        aria-invalid={message?.tone === "error"}
        className={fieldClass(message?.tone === "error", className)}
        defaultValue={value === undefined ? defaultValue : undefined}
        id={id}
        name={name}
        onBlur={(event: FocusEvent<HTMLInputElement>) => validate(event.currentTarget, true)}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onValueChange?.(event.currentTarget.value);
          validate(event.currentTarget, false);
        }}
        placeholder={placeholder ?? example}
        required={required}
        value={value}
      />
    </FieldFrame>
  );
}

export function AdminNumberField(props: NumberFieldProps) {
  return <AdminTextField inputMode="numeric" step={1} type="number" {...props} />;
}

export function AdminSelectField({
  label,
  name,
  required = false,
  example,
  hint,
  externalError,
  options,
  defaultValue,
  value,
  optionalLabel,
  onValueChange,
}: SelectFieldProps) {
  const id = useId();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const message = externalError
    ? { tone: "error" as const, message: externalError }
    : feedback;

  return (
    <FieldFrame
      example={example}
      feedback={message}
      hint={hint}
      id={id}
      label={label}
      required={required}
    >
      <select
        aria-describedby={`${id}-help ${id}-feedback`}
        aria-invalid={message?.tone === "error"}
        className={fieldClass(message?.tone === "error")}
        defaultValue={value === undefined ? defaultValue : undefined}
        id={id}
        name={name}
        onBlur={(event) =>
          setFeedback(validationFeedback(event.currentTarget, label, undefined, true))
        }
        onChange={(event) => {
          onValueChange?.(event.currentTarget.value);
          setFeedback(validationFeedback(event.currentTarget, label, undefined, false));
        }}
        required={required}
        value={value}
      >
        {optionalLabel ? <option value="">{optionalLabel}</option> : null}
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

export function AdminTextareaField({
  label,
  name,
  required = false,
  example,
  hint,
  externalError,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  className,
  ...textareaProps
}: TextareaFieldProps) {
  const id = useId();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const message = externalError
    ? { tone: "error" as const, message: externalError }
    : feedback;

  return (
    <FieldFrame
      example={example}
      feedback={message}
      hint={hint}
      id={id}
      label={label}
      required={required}
    >
      <textarea
        {...textareaProps}
        aria-describedby={`${id}-help ${id}-feedback`}
        aria-invalid={message?.tone === "error"}
        className={fieldClass(message?.tone === "error", `min-h-24 py-2 ${className ?? ""}`)}
        defaultValue={value === undefined ? defaultValue : undefined}
        id={id}
        name={name}
        onBlur={(event) =>
          setFeedback(validationFeedback(event.currentTarget, label, undefined, true))
        }
        onChange={(event) => {
          onValueChange?.(event.currentTarget.value);
          setFeedback(validationFeedback(event.currentTarget, label, undefined, false));
        }}
        placeholder={placeholder ?? example}
        required={required}
        value={value}
      />
    </FieldFrame>
  );
}

export function AdminFileField({
  label,
  name,
  required = false,
  example,
  hint,
  externalError,
  className,
  ...inputProps
}: FileFieldProps) {
  const id = useId();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const message = externalError
    ? { tone: "error" as const, message: externalError }
    : feedback;

  return (
    <FieldFrame
      example={example}
      feedback={message}
      hint={hint}
      id={id}
      label={label}
      required={required}
    >
      <input
        {...inputProps}
        aria-describedby={`${id}-help ${id}-feedback`}
        aria-invalid={message?.tone === "error"}
        className={fieldClass(message?.tone === "error", `py-2 ${className ?? ""}`)}
        id={id}
        name={name}
        onBlur={(event) =>
          setFeedback(validationFeedback(event.currentTarget, label, undefined, true))
        }
        onChange={(event) =>
          setFeedback(validationFeedback(event.currentTarget, label, undefined, true))
        }
        required={required}
        type="file"
      />
    </FieldFrame>
  );
}

function FieldFrame({
  children,
  example,
  feedback,
  hint,
  id,
  label,
  required,
}: {
  children: React.ReactNode;
  example: string;
  feedback: Feedback;
  hint?: string;
  id: string;
  label: string;
  required: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-700" htmlFor={id}>
      <span>
        {label}
        {required ? (
          <span aria-label="required" className="ml-1 text-rose-600">
            *
          </span>
        ) : null}
      </span>
      {children}
      <span className="text-xs font-normal text-zinc-500" id={`${id}-help`}>
        Example: {example}
        {hint ? ` · ${hint}` : ""}
      </span>
      <span
        aria-live="polite"
        className={`min-h-4 text-xs font-normal ${
          feedback?.tone === "error"
            ? "text-rose-700"
            : feedback?.tone === "success"
              ? "text-emerald-700"
              : "text-transparent"
        }`}
        id={`${id}-feedback`}
      >
        {feedback?.message ?? "."}
      </span>
    </label>
  );
}

function validationFeedback(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  label: string,
  patternMessage: string | undefined,
  showSuccess: boolean
): Feedback {
  const value = element.value.trim();
  const validity = element.validity;

  if (validity.valueMissing) return { tone: "error", message: `${label} is required.` };
  if (validity.typeMismatch) return { tone: "error", message: `Enter a valid ${label.toLowerCase()}.` };
  if (validity.patternMismatch) {
    return { tone: "error", message: patternMessage ?? `${label} has an invalid format.` };
  }
  if (validity.tooShort) {
    return { tone: "error", message: `${label} is shorter than the minimum length.` };
  }
  if (validity.tooLong) {
    return { tone: "error", message: `${label} exceeds the maximum length.` };
  }
  if (validity.rangeUnderflow) {
    return { tone: "error", message: `${label} is below the minimum allowed value.` };
  }
  if (validity.rangeOverflow) {
    return { tone: "error", message: `${label} exceeds the maximum allowed value.` };
  }
  if (validity.stepMismatch) {
    return { tone: "error", message: `${label} must use a valid increment.` };
  }
  if (validity.badInput) return { tone: "error", message: `${label} must be a valid value.` };
  if (!validity.valid) return { tone: "error", message: element.validationMessage };
  if (showSuccess && value) return { tone: "success", message: `${label} looks valid.` };
  return null;
}

function fieldClass(invalid: boolean, extra?: string) {
  return [
    "min-h-11 min-w-0 rounded-md border bg-white px-3 text-base text-zinc-950 outline-none transition focus:ring-2 sm:text-sm",
    invalid
      ? "border-rose-400 focus:border-rose-600 focus:ring-rose-100"
      : "border-zinc-300 focus:border-emerald-600 focus:ring-emerald-100",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
