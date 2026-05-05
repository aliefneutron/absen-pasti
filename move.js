const fs = require('fs');

const path = 'src/pages/Admin.tsx';
let content = fs.readFileSync(path, 'utf-8');

const lines = content.split('\n');

// Find the boundaries
let startIdx = lines.findIndex(l => l.includes('/* === ATURAN KHUSUS JUMAT === */'));
// It has a divider before it, so let's take from the divider
startIdx = startIdx - 2; // the <div w-full ... />

let endIdx = -1;
for (let i = startIdx + 2; i < lines.length; i++) {
    if (lines[i].includes('</CardContent>')) {
        // The div right before it is the end of the section
        endIdx = i - 1;
        break;
    }
}

if (startIdx >= 0 && endIdx >= 0) {
    const extracted = lines.splice(startIdx, endIdx - startIdx + 1);
    
    // Find the insertion point (after "Siklus Shift & Tugas")
    const insertIdx = lines.findIndex(l => l.includes('/* Shift Configuration */'));
    // we need the end of the Shift Configuration div
    let shiftEndIdx = -1;
    for (let i = insertIdx; i < lines.length; i++) {
        if (lines[i].includes('<div className="w-full h-px bg-slate-100" />')) {
            shiftEndIdx = i; // we'll insert before the divider that follows
            break;
        }
    }
    
    if (shiftEndIdx >= 0) {
        lines.splice(shiftEndIdx, 0, ...extracted);
        fs.writeFileSync(path, lines.join('\n'), 'utf-8');
        console.log('Successfully moved section.');
    } else {
        console.error('Could not find insertion point.');
    }
} else {
    console.error('Could not find section to extract.', startIdx, endIdx);
}
