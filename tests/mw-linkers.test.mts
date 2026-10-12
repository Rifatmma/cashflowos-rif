// Which posts should link to the page we want to rank?
//   npx -y tsx --conditions=react-server tests/mw-linkers.test.mts
//
// The task used to say "link from two or three pages that already mention the
// topic" and leave the lead to find them. Then the owner asked whether a new
// blog post would help, I looked, and the instruction turned out to be hollow:
// none of the 289 posts uses the phrase "advertising boards". So it names them
// now — and when nothing is close enough, it says that instead of sending
// somebody hunting.

import { rankLinkers, linkStep, type BlogPost } from '../lib/mw-linkers'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const post = (o: Partial<BlogPost>): BlogPost =>
  ({ url: '/blog/x', title: 'A post', words: 1200, text: '', links: [], impressions: 0, ...o })

// ── the real shape: some posts are about it, most are not ──────────────────
const corpus: BlogPost[] = [
  post({ url: '/blog/programmatic-benefits', title: 'Benefits of programmatic DOOH',
    text: 'Programmatic DOOH lets buyers plan programmatic DOOH across markets. Programmatic DOOH in India is growing.', impressions: 800 }),
  post({ url: '/blog/airport-media', title: 'Airport media',
    text: 'Airport screens reach travellers in India and beyond.', impressions: 200 }),
  post({ url: '/blog/recipes-for-retail', title: 'Retail media', text: 'Retail media networks and shopper data.' }),
  post({ url: '/blog/already-linked', title: 'Programmatic DOOH explained',
    text: 'Programmatic DOOH is bought in real time.', links: ['/locations/india'], impressions: 5000 }),
]

{
  const l = rankLinkers({ posts: corpus, topic: 'programmatic dooh', target: '/locations/india', places: ['India'] })
  is(l[0].url === '/blog/programmatic-benefits',
     'the post using the phrase most, that also names the market, comes first')
  is(/uses "programmatic dooh" 3 times already/.test(l[0].why),
     'and the reason counts the actual uses rather than asserting relevance')
  is(!l.some(x => x.url === '/blog/recipes-for-retail'),
     'a post with nothing of the topic in it is never suggested — a link nobody would write by hand is a link Google discounts')
}
{
  const l = rankLinkers({ posts: corpus, topic: 'programmatic dooh', target: '/locations/india', places: ['India'] })
  const linked = l.find(x => x.url === '/blog/already-linked')
  is(!!linked?.alreadyLinks, 'a post that already links to the target is flagged')
  is(l[l.length - 1].url === '/blog/already-linked',
     'and sorted last despite 5,000 impressions, because there is nothing to add there')
  is(!linkStep(l, 'programmatic dooh', '/locations/india')!.includes('already-linked'),
     'so it never appears in the instruction')
}
{
  // The case that started this.
  const l = rankLinkers({ posts: corpus, topic: 'advertising boards', target: '/locations/india/bengaluru', places: ['India'] })
  is(l.length === 0, 'nothing in the corpus covers "advertising boards", so nothing is suggested')
  const step = linkStep(l, 'advertising boards', '/locations/india/bengaluru')!
  is(/Nothing we have published is close enough/.test(step),
     'and the step says so rather than sending the lead hunting for posts that do not exist')
  is(/NOT to rank for the phrase/.test(step),
     'the explainer is offered with the trap named: a post that competes with the page moves the problem')
  is(/moved the problem rather than fixed it/.test(step), 'in plain words')
}
{
  const reach = rankLinkers({
    topic: 'retail media', target: '/locations/india', places: [],
    posts: [
      post({ url: '/blog/quiet', text: 'Retail media is growing.', impressions: 0 }),
      post({ url: '/blog/read', text: 'Retail media is growing.', impressions: 10_000 }),
    ],
  })
  is(reach[0].url === '/blog/read', 'between two equally relevant posts, the one people read lends more')
  is(/10,000 impressions/.test(reach[0].why), 'and the reach is stated, not implied')
}
{
  const l = rankLinkers({ posts: corpus, topic: 'programmatic dooh', target: '/locations/india', limit: 2 })
  is(l.length <= 2, 'the shortlist is capped — four posts to edit is a task, twenty is a project')
}
{
  const step = linkStep(
    rankLinkers({ posts: corpus, topic: 'airport media', target: '/locations/india', places: ['India'] }),
    'airport media', '/locations/india')!
  is(/anchor text/.test(step) && /an edit, not a new page/.test(step),
     'the instruction names the anchor text and says plainly it is an edit')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
