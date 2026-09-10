import ReactDOM from 'react-dom/client'
import { ReviewList } from './ReviewList'
import './main.css'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('index.html is missing #root')
}

ReactDOM.createRoot(root).render(<ReviewList />)
