import { useState } from 'react'
import './App.css'
import { NewListings } from './NewListings'
import { Ordered } from './Ordered'

const TABS = ['New Listings', 'Ordered', 'eBay Listings'] as const
type Tab = (typeof TABS)[number]

function ComingSoon() {
  return <p className="coming-soon">Coming soon.</p>
}

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
        {activeTab === 'eBay Listings' && <ComingSoon />}
      </main>
    </div>
  )
}

export default App
