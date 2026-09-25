// What the Settings view shows of the sections a pack registered. The app stores them without knowing their shape,
// so the shape the view draws lives here with the view.
export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * A form's request to change one setting: where in its own slice, and the new value. A setting is arbitrary JSON and
 * the store checks each next document, so the value is `unknown` here rather than a union the view would have to
 * keep in step with every section a pack registers.
 */
export interface SettingUpdate {
  path: string[];
  value: unknown;
}

/** The `personal` slice as the form that draws it reads it back */
export interface PersonalSection {
  name?: string;
  phoneNumber?: string;
  address?: Address;
}

/**
 * The `general` section as this view draws it. The host stores a section without knowing its shape — a pack registers
 * it — so what the Settings view renders of one is declared here, beside the components that render it, and narrowed
 * once where it is read. The pack that registers `general` declares its own, fuller shape for its own code.
 */
export interface GeneralSection {
  personal?: unknown;
  application?: unknown;
  projects?: unknown;
}
