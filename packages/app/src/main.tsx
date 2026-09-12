import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const ROOT_ELEMENT_ID = 'root';

// index.html owns this element. Failing here with the id that is missing beats a
// `!` that turns a broken shell into "createRoot of null" with no hint why.
const container = document.getElementById(ROOT_ELEMENT_ID);
if (!container) throw new Error(`Cannot mount: no #${ROOT_ELEMENT_ID} element in the document`);

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
