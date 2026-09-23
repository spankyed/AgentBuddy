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
 * The `general` section as this view draws it. The host stores a section without knowing its shape — a pack registers
 * it — so what the Settings view renders of one is declared here, beside the components that render it, and narrowed
 * once where it is read. The pack that registers `general` declares its own, fuller shape for its own code.
 */
export interface GeneralSection {
  personal?: unknown;
  application?: unknown;
  projects?: unknown;
}
