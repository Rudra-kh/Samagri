import SamagriLogo from '../../components/Brand/SamagriLogo'
import styles from './Landing.module.css'

export default function Landing({ onNavigate }) {
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <SamagriLogo className={styles.logoMark} />
          <h1 className={styles.brandName}>Samagri</h1>
        </div>

        <h2 className={styles.heading}>What would you like to do?</h2>

        <div className={styles.options}>
          <button className={styles.optionBtn} onClick={() => onNavigate('orders')}>
            <div className={styles.optionIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <span className={styles.optionLabel}>Take Order</span>
          </button>

          <button className={styles.optionBtn} onClick={() => onNavigate('cook')}>
            <div className={styles.optionIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h18v4H3z"/>
                <path d="M7 7v4a5 5 0 0 0 10 0V7"/>
                <path d="M6 21h12"/>
                <path d="M12 16v5"/>
              </svg>
            </div>
            <span className={styles.optionLabel}>Cook Dashboard</span>
          </button>

          <button className={styles.optionBtn} onClick={() => onNavigate('inventory')}>
            <div className={styles.optionIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <span className={styles.optionLabel}>Manage Inventory</span>
          </button>

        </div>
      </div>
    </div>
  )
}
