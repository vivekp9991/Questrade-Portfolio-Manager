/* @refresh reload */
import { render } from 'solid-js/web';
import './styles/theme.css';
import './index.css';
import App from './App.jsx';

const root = document.getElementById('root');

render(() => <App />, root);
