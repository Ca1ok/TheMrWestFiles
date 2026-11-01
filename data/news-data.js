// News templates. Every day the world generates ~8 articles from these, identically for every player (seeded by the date).
// kind: 'el' = moves one element's price, 'sec' = moves a real-estate sector, 'fun' = pure comedy.
// Placeholders: {el} {el2} {city} {num}. `pct` is the size range of the effect (fraction), + or −.
const NEWS_CITIES = ['Fumeton', 'Beakerville', 'Titration Bay', 'Mole Hill', 'Ionia Heights', 'Port Reagent', 'Bunsenburg', 'Catalyst City', 'Distillery Row', 'Lake Entropy'];
const NEWS_TEMPLATES = [
  // ---- element price movers ----
  { kind:'el', pct:[0.12,0.40], h:'Shortage of {el} sends buyers into a frenzy',          b:'Traders were seen sprinting through the lobby carrying nothing but a clipboard and a dream.' },
  { kind:'el', pct:[0.10,0.35], h:'New prototype battery runs entirely on {el}',          b:'Engineers say it works "in theory, and also on Tuesdays".' },
  { kind:'el', pct:[0.10,0.30], h:'{el} named Element of the Year by people who name things', b:'The trophy is made of {el2}, as a statement.' },
  { kind:'el', pct:[0.12,0.35], h:'Mr West endorses {el}, then denies knowing what it is', b:'Sources close to the teacher say the endorsement "was meant for {el2}".' },
  { kind:'el', pct:[0.10,0.30], h:'Celebrity photographed wearing {el} jewellery',         b:'Sales spiked within minutes. The celebrity said it was "just a paperclip".' },
  { kind:'el', pct:[-0.35,-0.10], h:'{el} glut: warehouse found holding four tonnes nobody ordered', b:'The delivery driver says he "just followed the satnav".' },
  { kind:'el', pct:[-0.30,-0.10], h:'Study finds {el} "less useful than previously thought"',        b:'The study was funded by a company that sells {el2}. Coincidence, say officials.' },
  { kind:'el', pct:[-0.35,-0.12], h:'Mine reopens: {el} supply floods the market',                   b:'Prices fell faster than a student’s grade after a surprise quiz.' },
  { kind:'el', pct:[-0.30,-0.10], h:'Rumour that {el} can be made from air sends prices tumbling',    b:'Chemists point out that air is mostly nitrogen. The rumour continues regardless.' },
  { kind:'el', pct:[-0.28,-0.10], h:'Recall: batch of {el} found to be mostly {el2}',                 b:'Customers describe the mix-up as "the least surprising chemistry of the year".' },
  { kind:'el', pct:[0.15,0.45], h:'Heist! Thieves make off with a vault of {el}',                    b:'Police say the getaway car was "visibly overloaded".' },
  // ---- real-estate sector movers ----
  { kind:'sec', sector:'residential', pct:[-0.06,-0.02], h:'Mystery smell across {city}; residents blame "the chemistry teacher"', b:'Local estate agents describe the aroma as "character".' },
  { kind:'sec', sector:'residential', pct:[-0.05,-0.02], h:'Acid-rain scare hits {city} suburbs',                                   b:'Umbrellas dissolve; sales of umbrellas, ironically, do not.' },
  { kind:'sec', sector:'residential', pct:[0.02,0.06],  h:'{city} named best place to live by a committee of fish',                b:'The committee was unavailable for comment, being fish.' },
  { kind:'sec', sector:'residential', pct:[0.02,0.05],  h:'Fume hoods now standard in every {city} kitchen',                       b:'Homes with a working extractor fan "have never been more desirable".' },
  { kind:'sec', sector:'commercial',  pct:[0.02,0.06],  h:'Pop-up chemistry café opens in {city}',                                  b:'The cappuccinos are served in beakers; the lines are out the door.' },
  { kind:'sec', sector:'commercial',  pct:[0.02,0.05],  h:'Lab-coat fashion craze boosts {city} shops',                             b:'"Safety goggles are the new sunglasses," says a person in safety goggles.' },
  { kind:'sec', sector:'commercial',  pct:[-0.06,-0.02], h:'Shopping arcade flooded by "harmless" foam experiment',                 b:'The foam is described as "mostly soap" and "not going anywhere".' },
  { kind:'sec', sector:'industrial',  pct:[0.03,0.07],  h:'{city} chemical works wins contract for ten million test tubes',          b:'Production lines will run around the clock, safety permitting.' },
  { kind:'sec', sector:'industrial',  pct:[0.02,0.06],  h:'Fertiliser boom: {city} plants run overtime',                             b:'Farmers report "unusually green optimism".' },
  { kind:'sec', sector:'industrial',  pct:[-0.07,-0.03], h:'Inspector finds {city} plant "mostly leak"',                             b:'The plant has been asked to be less of a puddle.' },
  { kind:'sec', sector:'land',        pct:[0.03,0.08],  h:'Rare mineral spotted near {city}; land prices fizz',                      b:'The mineral is, upon closer inspection, a very shiny rock. Prices hold anyway.' },
  { kind:'sec', sector:'land',        pct:[-0.08,-0.03], h:'Sinkhole swallows {num} hectares outside {city}',                        b:'Landowners are "taking it hard", mostly because it is now below ground level.' },
  { kind:'sec', sector:'luxury',      pct:[0.03,0.08],  h:'Billionaire buys a periodic table "for the vibes"',                      b:'He has reportedly asked if there is a bigger one.' },
  { kind:'sec', sector:'luxury',      pct:[-0.07,-0.03], h:'Yacht made of sodium tested on a lake; luxury market sinks',             b:'Observers say the trial was "short and extremely bright".' },
  // ---- comedy (no market effect) ----
  { kind:'fun', h:'Student claims baking-soda volcano "erupted with feeling"',                  b:'The judges awarded it points for drama, deducted for the ceiling.' },
  { kind:'fun', h:'Local man discovers water is wet; chemistry community unmoved',              b:'"We’ve known for some time," said a spokesperson, wiping a desk.' },
  { kind:'fun', h:'Teacher marks "{el}" as incorrect on quiz — it was correct',                  b:'The student has requested a recount and a small apology.' },
  { kind:'fun', h:'Periodic table gains a new row "just to see what happens"',                   b:'Scientists call it "bold" and "extremely annoying to print".' },
  { kind:'fun', h:'Scientists confirm the mole is not an animal',                                b:'It is 6.022 × 10²³ of something. Moles (the animals) were relieved.' },
  { kind:'fun', h:'Bunsen burner shortage: "It’s getting hot out there," say analysts',          b:'Suppliers promise new stock "as soon as the old stock stops being on fire".' },
  { kind:'fun', h:'Noble gases refuse to react to rumours',                                      b:'"They’re just not interested," said a source, "in anything."' },
  { kind:'fun', h:'Titration enthusiasts gather; drip by drip, they wait',                       b:'The endpoint is expected "any minute now, give or take a few hours".' },
  { kind:'fun', h:'Nine out of ten chemists prefer reactions that don’t explode',                b:'The tenth chemist declined to comment and was last seen leaving quickly.' },
  { kind:'fun', h:'Entropy increases; officials call it "expected"',                             b:'Desks everywhere got messier. No further action will be taken.' },
  { kind:'fun', h:'Perchlorate prices spike after unexplained "inventory incident"',             b:'A wanted poster has been seen in the area. Nobody is surprised.' },
  { kind:'fun', h:'Missing: Mr West. Last seen near the fume cupboard',                          b:'Reward: one (1) after-school detention. Terms and conditions apply.' },
  { kind:'fun', h:'{el} and {el2} spotted "getting along suspiciously well"',                    b:'Chemists say a reaction is "inevitable, but not tonight".' },
  { kind:'fun', h:'Lab goggles fog up; productivity down 40%',                                   b:'Experts recommend "not breathing so much".' },
  { kind:'fun', h:'Local school bans the phrase "it’s probably fine" in labs',                   b:'The ban took effect immediately, then took effect again, louder.' },
  { kind:'fun', h:'Man arrested for impersonating a catalyst',                                   b:'He claimed he "made everything go faster". He did not.' }
];
