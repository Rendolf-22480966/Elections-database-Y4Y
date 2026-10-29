import { z } from "zod";
import { normalizeGhanaPhone } from "@/lib/phone";
import { ROLES } from "@/lib/roles";

export const verificationStatuses = ["verified", "pending", "requires_correction"] as const;
export const genders = ["female", "male", "other", "prefer_not_to_say"] as const;

const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter the full name.")
  .max(120, "Name is too long.")
  .regex(/^[\p{L}]+(?:[ .'-][\p{L}]+)*$/u, "Use letters, spaces, apostrophes, or hyphens only.");

const noteSchema = z
  .string()
  .trim()
  .max(500, "Keep the administrative note under 500 characters.")
  .optional()
  .or(z.literal(""));

export const recordFormSchema = z.object({
  full_name: nameSchema,
  constituency_id: z.string().uuid("Select a constituency."),
  telephone: z
    .string()
    .trim()
    .min(1, "Telephone is required for authorized administrative contact.")
    .transform((value, ctx) => {
      const normalized = normalizeGhanaPhone(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid Ghana number, for example 0241234567 or +233241234567.",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  gender: z.enum(genders).optional().or(z.literal("")),
  verification_status: z.enum(verificationStatuses),
  admin_note: noteSchema,
  confirm_duplicate: z.boolean().optional(),
});

export const recordUpdateSchema = recordFormSchema.extend({
  id: z.string().uuid(),
});

export const verificationChangeSchema = z.object({
  record_id: z.string().uuid(),
  to_status: z.enum(verificationStatuses),
  reason: z.string().trim().min(8, "Document a brief administrative reason (at least 8 characters).").max(300),
});

export const roleUpdateSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(ROLES),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const signupSchema = loginSchema.extend({
  full_name: nameSchema,
});

export const profileUpdateSchema = z.object({
  full_name: nameSchema,
});

export const passwordUpdateSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters."),
    confirm_password: z.string(),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });

export type RecordFormValues = z.input<typeof recordFormSchema>;
