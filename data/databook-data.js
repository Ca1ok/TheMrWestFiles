// Chemistry databook reference tables — independently compiled public data (constants,
// conversions, solubility rules, etc). See the chat notes about checking this against your
// official VCAA data book before an exam. Edit here without touching site logic.

const DATABOOK = [
  { id:'electrochem', title:'Electrochemical Series (selected, 25°C)', body: `
    <table><tr><th>Half-reaction</th><th>E° (V)</th></tr>
      <tr><td>F₂ + 2e⁻ → 2F⁻</td><td>+2.87</td></tr>
      <tr><td>MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O</td><td>+1.51</td></tr>
      <tr><td>Cl₂ + 2e⁻ → 2Cl⁻</td><td>+1.36</td></tr>
      <tr><td>O₂ + 4H⁺ + 4e⁻ → 2H₂O</td><td>+1.23</td></tr>
      <tr><td>Ag⁺ + e⁻ → Ag</td><td>+0.80</td></tr>
      <tr><td>Fe³⁺ + e⁻ → Fe²⁺</td><td>+0.77</td></tr>
      <tr><td>I₂ + 2e⁻ → 2I⁻</td><td>+0.54</td></tr>
      <tr><td>Cu²⁺ + 2e⁻ → Cu</td><td>+0.34</td></tr>
      <tr><td>2H⁺ + 2e⁻ → H₂</td><td>0.00 (reference)</td></tr>
      <tr><td>Pb²⁺ + 2e⁻ → Pb</td><td>−0.13</td></tr>
      <tr><td>Ni²⁺ + 2e⁻ → Ni</td><td>−0.26</td></tr>
      <tr><td>Fe²⁺ + 2e⁻ → Fe</td><td>−0.44</td></tr>
      <tr><td>Zn²⁺ + 2e⁻ → Zn</td><td>−0.76</td></tr>
      <tr><td>Al³⁺ + 3e⁻ → Al</td><td>−1.66</td></tr>
      <tr><td>Mg²⁺ + 2e⁻ → Mg</td><td>−2.37</td></tr>
      <tr><td>Na⁺ + e⁻ → Na</td><td>−2.71</td></tr>
      <tr><td>K⁺ + e⁻ → K</td><td>−2.93</td></tr>
      <tr><td>Li⁺ + e⁻ → Li</td><td>−3.04</td></tr>
    </table>
    <div class="db-note">More positive E° = stronger oxidant. Species higher in the table oxidise species lower down.</div>
  `},
  { id:'relationships', title:'Chemical Relationships', body: `
    <table><tr><th>Relationship</th><th>Formula</th></tr>
      <tr><td>Moles from mass</td><td>n = m / M</td></tr>
      <tr><td>Moles of gas (STP/SLC)</td><td>n = V / Vm</td></tr>
      <tr><td>Concentration</td><td>c = n / V</td></tr>
      <tr><td>Ideal gas law</td><td>PV = nRT</td></tr>
      <tr><td>Dilution</td><td>c₁V₁ = c₂V₂</td></tr>
      <tr><td>pH</td><td>pH = −log₁₀[H⁺]</td></tr>
      <tr><td>pOH</td><td>pOH = −log₁₀[OH⁻]</td></tr>
      <tr><td>Water equilibrium (25°C)</td><td>pH + pOH = 14</td></tr>
      <tr><td>Faraday's law</td><td>Q = n(e⁻) × F</td></tr>
      <tr><td>Percentage yield</td><td>(actual / theoretical) × 100</td></tr>
    </table>
  `},
  { id:'constants', title:'Physical Constants &amp; Standard Values', body: `
    <table><tr><th>Constant</th><th>Symbol</th><th>Value</th></tr>
      <tr><td>Avogadro's number</td><td>Nₐ</td><td>6.022 × 10²³ mol⁻¹</td></tr>
      <tr><td>Gas constant</td><td>R</td><td>8.314 J K⁻¹ mol⁻¹</td></tr>
      <tr><td>Faraday constant</td><td>F</td><td>96 485 C mol⁻¹</td></tr>
      <tr><td>Molar volume of gas at STP (0°C, 100 kPa)</td><td>Vm</td><td>22.7 L mol⁻¹</td></tr>
      <tr><td>Molar volume of gas at SLC (25°C, 100 kPa)</td><td>Vm</td><td>24.8 L mol⁻¹</td></tr>
      <tr><td>Ionic product of water (25°C)</td><td>Kw</td><td>1.0 × 10⁻¹⁴</td></tr>
      <tr><td>Standard atmospheric pressure</td><td>—</td><td>101.3 kPa</td></tr>
      <tr><td>Standard temperature (STP)</td><td>—</td><td>0°C (273.15 K)</td></tr>
    </table>
  `},
  { id:'conversions', title:'Unit Conversions', body: `
    <table><tr><th>From</th><th>To</th><th>Multiply by</th></tr>
      <tr><td>°C</td><td>K</td><td>+ 273.15</td></tr>
      <tr><td>kPa</td><td>atm</td><td>÷ 101.3</td></tr>
      <tr><td>mL</td><td>L</td><td>÷ 1000</td></tr>
      <tr><td>g</td><td>kg</td><td>÷ 1000</td></tr>
      <tr><td>J</td><td>kJ</td><td>÷ 1000</td></tr>
      <tr><td>nm</td><td>m</td><td>× 10⁻⁹</td></tr>
    </table>
  `},
  { id:'prefixes', title:'Metric Prefixes', body: `
    <table><tr><th>Prefix</th><th>Symbol</th><th>Factor</th></tr>
      <tr><td>giga</td><td>G</td><td>10⁹</td></tr>
      <tr><td>mega</td><td>M</td><td>10⁶</td></tr>
      <tr><td>kilo</td><td>k</td><td>10³</td></tr>
      <tr><td>centi</td><td>c</td><td>10⁻²</td></tr>
      <tr><td>milli</td><td>m</td><td>10⁻³</td></tr>
      <tr><td>micro</td><td>µ</td><td>10⁻⁶</td></tr>
      <tr><td>nano</td><td>n</td><td>10⁻⁹</td></tr>
      <tr><td>pico</td><td>p</td><td>10⁻¹²</td></tr>
    </table>
  `},
  { id:'indicators', title:'Acid-Base Indicators', body: `
    <table><tr><th>Indicator</th><th>pH range</th><th>Acid colour</th><th>Base colour</th></tr>
      <tr><td>Methyl orange</td><td>3.1 – 4.4</td><td>Red</td><td>Yellow</td></tr>
      <tr><td>Bromothymol blue</td><td>6.0 – 7.6</td><td>Yellow</td><td>Blue</td></tr>
      <tr><td>Litmus</td><td>4.5 – 8.3</td><td>Red</td><td>Blue</td></tr>
      <tr><td>Phenolphthalein</td><td>8.3 – 10.0</td><td>Colourless</td><td>Pink</td></tr>
    </table>
  `},
  { id:'ions', title:'Formulas &amp; Charges of Common Ions', body: `
    <table><tr><th>Cations</th><th>Charge</th></tr>
      <tr><td>NH₄⁺</td><td>+1</td></tr><tr><td>Cu⁺ / Cu²⁺</td><td>+1 / +2</td></tr>
      <tr><td>Fe²⁺ / Fe³⁺</td><td>+2 / +3</td></tr><tr><td>Ag⁺</td><td>+1</td></tr>
      <tr><td>Zn²⁺</td><td>+2</td></tr><tr><td>Al³⁺</td><td>+3</td></tr>
    </table>
    <table><tr><th>Anions</th><th>Charge</th></tr>
      <tr><td>OH⁻</td><td>−1</td></tr><tr><td>NO₃⁻</td><td>−1</td></tr>
      <tr><td>CO₃²⁻</td><td>−2</td></tr><tr><td>SO₄²⁻</td><td>−2</td></tr>
      <tr><td>PO₄³⁻</td><td>−3</td></tr><tr><td>CH₃COO⁻ (acetate)</td><td>−1</td></tr>
    </table>
  `},
  { id:'solubility', title:'Solubility Table (general rules)', body: `
    <table><tr><th>Ion</th><th>Solubility</th></tr>
      <tr><td>Group 1 &amp; NH₄⁺ salts</td><td>Soluble (all)</td></tr>
      <tr><td>NO₃⁻, CH₃COO⁻</td><td>Soluble (all)</td></tr>
      <tr><td>Cl⁻, Br⁻, I⁻</td><td>Soluble, except Ag⁺, Pb²⁺, Hg₂²⁺</td></tr>
      <tr><td>SO₄²⁻</td><td>Soluble, except Ba²⁺, Sr²⁺, Pb²⁺, Ca²⁺ (slightly)</td></tr>
      <tr><td>CO₃²⁻, PO₄³⁻</td><td>Insoluble, except Group 1 &amp; NH₄⁺</td></tr>
      <tr><td>OH⁻</td><td>Insoluble, except Group 1, Ba²⁺ (Ca(OH)₂ slightly soluble)</td></tr>
    </table>
  `},
  { id:'organic', title:'Organic Chemistry — Homologous Series', body: `
    <table><tr><th>Series</th><th>General formula</th><th>Functional group</th></tr>
      <tr><td>Alkanes</td><td>CₙH₂ₙ₊₂</td><td>C–C single bonds</td></tr>
      <tr><td>Alkenes</td><td>CₙH₂ₙ</td><td>C=C double bond</td></tr>
      <tr><td>Alkynes</td><td>CₙH₂ₙ₋₂</td><td>C≡C triple bond</td></tr>
      <tr><td>Alcohols</td><td>CₙH₂ₙ₊₁OH</td><td>–OH</td></tr>
      <tr><td>Carboxylic acids</td><td>CₙH₂ₙ₊₁COOH</td><td>–COOH</td></tr>
      <tr><td>Esters</td><td>—</td><td>–COO–</td></tr>
      <tr><td>Amines</td><td>CₙH₂ₙ₊₃N</td><td>–NH₂</td></tr>
    </table>
  `}
];
