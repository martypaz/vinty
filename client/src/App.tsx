import { useState } from 'react'
import './App.css'
import { NewListings } from './NewListings'
import { Ordered } from './Ordered'
import { EbayListings } from './EbayListings'
import { Tools } from './Tools'

const TABS = ['New Listings', 'Ordered', 'eBay Listings', 'Tools'] as const
type Tab = (typeof TABS)[number]

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('New Listings')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Vinty</h1>
        <nav className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={tab === activeTab ? 'tab tab-active' : 'tab'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {activeTab === 'New Listings' && <NewListings />}
        {activeTab === 'Ordered' && <Ordered />}
        {activeTab === 'eBay Listings' && <EbayListings />}
        {activeTab === 'Tools' && <Tools />}
      </main>
    </div>
  )
}

export default App
