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
