import ReactDOM from 'react-dom/client'
import { CaptureWidget } from './CaptureWidget'
import './widget.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('widget.html is missing #root')
}

// No StrictMode: its double invoked effects would register the capture
// listener twice in dev, and dev is where the round trip gets measured.
ReactDOM.createRoot(root).render(<CaptureWidget />)
