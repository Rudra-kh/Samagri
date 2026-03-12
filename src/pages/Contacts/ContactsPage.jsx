import { useState } from 'react'
import { DEALERS } from '../../data/dealersSeed'
import styles from './ContactsPage.module.css'

export default function ContactsPage() {
  const [selected, setSelected] = useState(null)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Contacts</h1>
        <p className={styles.subtitle}>{DEALERS.length} dealers</p>
      </div>

      <div className={styles.grid}>
        {DEALERS.map(dealer => (
          <button
            key={dealer.id}
            className={styles.card}
            onClick={() => setSelected(dealer)}
          >
            <img
              src={dealer.photo}
              alt={dealer.name}
              className={styles.avatar}
            />
            <div className={styles.cardInfo}>
              <span className={styles.dealerName}>{dealer.name}</span>
              <span className={styles.dealerPhone}>{dealer.phone}</span>
              <span className={styles.dealerAddr}>{dealer.address}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Dealer Detail Modal */}
      {selected && (
        <div className={styles.overlay} onClick={() => setSelected(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>

            <div className={styles.modalHeader}>
              <img src={selected.photo} alt={selected.name} className={styles.modalAvatar} />
              <div>
                <h2 className={styles.modalName}>{selected.name}</h2>
                <p className={styles.modalPhone}>{selected.phone}</p>
                <p className={styles.modalAddr}>{selected.address}</p>
              </div>
            </div>

            <div className={styles.itemsSection}>
              <h3 className={styles.itemsTitle}>Items Supplied</h3>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Rate (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item, i) => (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td className={styles.rate}>₹{item.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
