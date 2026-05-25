import {Icons} from '../../primitives/Icon';
import type {SettingsSurfaceState} from '../settingsTypes';
import './SettingsCommon.module.css';
import {makeStyles} from '../../primitives/makeStyles';
const styles = makeStyles('SettingsCommon');

export function PersonalSettings({user}: {user: SettingsSurfaceState['user']}) {
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Personal Information</h2>
        <p className={styles.description}>Manage your personal details and contact information. This information is only stored locally on your device, to be used in AI workflows.</p>
      </header>
      <section className={styles.card}>
        <div className={styles.sectionHeader}><Icons.User size={16} />Personal Details</div>
        <div className={styles.grid2}>
          <label><span className={styles.label}>Full Name</span><input className={styles.input} readOnly value={user.name} /><div className={styles.hint}>How you'd like to be addressed</div></label>
          <label><span className={styles.label}>Phone Number</span><input className={styles.input} readOnly value={user.phoneNumber} /><div className={styles.hint}>For important notifications</div></label>
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.sectionHeader}><Icons.MapPin size={16} />Address Information</div>
        <div className={styles.grid2}>
          <label><span className={styles.label}>Street Address</span><input className={styles.input} readOnly value={user.address.street} /></label>
          <label><span className={styles.label}>Apartment, suite, etc.</span><input className={styles.input} readOnly value={user.address.street2 ?? ''} /></label>
          <label><span className={styles.label}>City</span><input className={styles.input} readOnly value={user.address.city} /></label>
          <label><span className={styles.label}>State</span><input className={styles.input} readOnly value={user.address.state} /></label>
          <label><span className={styles.label}>Postal Code</span><input className={styles.input} readOnly value={user.address.postalCode} /></label>
          <label><span className={styles.label}>Country</span><input className={styles.input} readOnly value={user.address.country} /></label>
        </div>
      </section>
    </div>
  );
}
