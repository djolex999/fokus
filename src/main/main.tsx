import ReactDOM from 'react-dom/client'
import { App } from './App'
import './main.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('index.html is missing #root')
}

ReactDOM.createRoot(root).render(<App />)
