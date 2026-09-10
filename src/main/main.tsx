import ReactDOM from 'react-dom/client'
import './main.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('index.html is missing #root')
}

// Session 1 leaves the main window empty on purpose. It gets content in
// Session 2, and it never opens by itself.
ReactDOM.createRoot(root).render(<div className="placeholder">fokus</div>)
