/**
 * Founder / innovator / artist quotes for Fitness (and anywhere else).
 * Rotates on a private 6-hour timer (no UI countdown — just the line + name).
 *
 * Heroes: Jobs, Musk, Altman, Disney, builders + Bowie & Michael Jackson.
 * Prefer zing: relatable, transcendable, edge — not soft poster fluff.
 * Real attributed lines only.
 */

export type DailyQuote = {
  text: string;
  source: string;
  /** Optional short tag for future UI (e.g. "build", "focus") */
  tag?: string;
  /**
   * Extra rotation weight on top of source favorites.
   * High = more zing / how often it surfaces (1 default, 2–3 for icons).
   */
  weight?: number;
};

/**
 * Curated bank. Real attributed lines only — no fake “quotes.”
 * Add more anytime; the day picker wraps cleanly.
 */
export const HERO_QUOTES: DailyQuote[] = [
  // ── Steve Jobs ─────────────────────────────────────────────
  {
    text: "The people who are crazy enough to think they can change the world are the ones who do.",
    source: "Steve Jobs",
    tag: "ambition",
    weight: 3,
  },
  {
    text: "Stay hungry. Stay foolish.",
    source: "Steve Jobs",
    tag: "drive",
  },
  {
    text: "Innovation distinguishes between a leader and a follower.",
    source: "Steve Jobs",
    tag: "build",
  },
  {
    text: "Design is not just what it looks like and feels like. Design is how it works.",
    source: "Steve Jobs",
    tag: "product",
  },
  {
    text: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work. And the only way to do great work is to love what you do.",
    source: "Steve Jobs",
    tag: "work",
    weight: 3,
  },
  {
    text: "Simple can be harder than complex: you have to work hard to get your thinking clean to make it simple.",
    source: "Steve Jobs",
    tag: "clarity",
    weight: 2,
  },
  {
    text: "I'm convinced that about half of what separates the successful entrepreneurs from the non-successful ones is pure perseverance.",
    source: "Steve Jobs",
    tag: "grit",
    weight: 2,
  },
  {
    text: "People think focus means saying yes to the thing you've got to focus on. But that's not what it means at all. It means saying no to the hundred other good ideas.",
    source: "Steve Jobs",
    tag: "focus",
    weight: 3,
  },
  {
    text: "You can't connect the dots looking forward; you can only connect them looking backwards. So you have to trust that the dots will somehow connect in your future.",
    source: "Steve Jobs",
    tag: "path",
    weight: 2,
  },
  {
    text: "Have the courage to follow your heart and intuition. They somehow already know what you truly want to become.",
    source: "Steve Jobs",
    tag: "intuition",
    weight: 2,
  },
  {
    text: "Real artists ship.",
    source: "Steve Jobs",
    tag: "ship",
  },
  {
    text: "Details matter. It's worth waiting to get it right.",
    source: "Steve Jobs",
    tag: "craft",
  },
  {
    text: "Quality is more important than quantity. One home run is much better than two doubles.",
    source: "Steve Jobs",
    tag: "standards",
    weight: 2,
  },
  {
    text: "Remembering that you are going to die is the best way I know to avoid the trap of thinking you have something to lose. You are already naked. There is no reason not to follow your heart.",
    source: "Steve Jobs",
    tag: "urgency",
    weight: 3,
  },

  // ── Elon Musk ──────────────────────────────────────────────
  {
    text: "When something is important enough, you do it even if the odds are not in your favor.",
    source: "Elon Musk",
    tag: "courage",
    weight: 3,
  },
  {
    text: "I think it is possible for ordinary people to choose to be extraordinary.",
    source: "Elon Musk",
    tag: "ambition",
    weight: 3,
  },
  {
    text: "Persistence is very important. You should not give up unless you are forced to give up.",
    source: "Elon Musk",
    tag: "grit",
    weight: 2,
  },
  {
    text: "If something is important enough, even if the odds are against you, you should still do it.",
    source: "Elon Musk",
    tag: "build",
    weight: 2,
  },
  {
    text: "The first step is to establish that something is possible; then probability will occur.",
    source: "Elon Musk",
    tag: "first-principles",
  },
  {
    text: "I could either watch it happen or be a part of it.",
    source: "Elon Musk",
    tag: "agency",
  },
  {
    text: "Constantly seek criticism. A well thought out critique of whatever you're doing is as valuable as gold.",
    source: "Elon Musk",
    tag: "feedback",
  },
  {
    text: "Some people don't like change, but you need to embrace change if the alternative is disaster.",
    source: "Elon Musk",
    tag: "change",
  },
  {
    text: "Work like hell. I mean you just have to put in 80 to 100 hour weeks every week.",
    source: "Elon Musk",
    tag: "work",
  },
  {
    text: "Being an entrepreneur is like eating glass and staring into the abyss of death.",
    source: "Elon Musk",
    tag: "founding",
  },
  {
    text: "Failure is an option here. If things are not failing, you are not innovating enough.",
    source: "Elon Musk",
    tag: "iteration",
  },
  {
    text: "I think it's very important to have a feedback loop, where you're constantly thinking about what you've done and how you could be doing it better.",
    source: "Elon Musk",
    tag: "feedback",
  },
  {
    text: "Life is too short for long-term grudges.",
    source: "Elon Musk",
    tag: "focus",
  },

  // ── John D. Rockefeller ────────────────────────────────────
  {
    text: "Don't be afraid to give up the good to go for the great.",
    source: "John D. Rockefeller",
    tag: "ambition",
  },
  {
    text: "I do not think that there is any other quality so essential to success of any kind as the quality of perseverance.",
    source: "John D. Rockefeller",
    tag: "grit",
  },
  {
    text: "The ability to deal with people is as purchasable a commodity as sugar or coffee, and I will pay more for that ability than for any other under the sun.",
    source: "John D. Rockefeller",
    tag: "people",
  },
  {
    text: "I always tried to turn every disaster into an opportunity.",
    source: "John D. Rockefeller",
    tag: "opportunity",
  },
  {
    text: "If you want to succeed you should strike out on new paths, rather than travel the worn paths of accepted success.",
    source: "John D. Rockefeller",
    tag: "build",
  },
  {
    text: "Do you know the only thing that gives me pleasure? It's to see my dividends coming in.",
    source: "John D. Rockefeller",
    tag: "capital",
  },
  {
    text: "Ownership is the foundation of wealth.",
    source: "John D. Rockefeller",
    tag: "ownership",
  },
  {
    text: "Singleness of purpose is one of the chief essentials for success in life, no matter what may be one's aim.",
    source: "John D. Rockefeller",
    tag: "focus",
  },

  // ── Jeff Bezos ─────────────────────────────────────────────
  {
    text: "Your brand is what other people say about you when you're not in the room.",
    source: "Jeff Bezos",
    tag: "brand",
  },
  {
    text: "If you double the number of experiments you do per year, you're going to double your inventiveness.",
    source: "Jeff Bezos",
    tag: "build",
  },
  {
    text: "We are stubborn on vision. We are flexible on details.",
    source: "Jeff Bezos",
    tag: "vision",
  },
  {
    text: "I knew that if I failed I wouldn't regret that, but I knew the one thing I might regret is not trying.",
    source: "Jeff Bezos",
    tag: "courage",
  },
  {
    text: "In the old world, you devoted 30% of your time to building a great service and 70% of your time to shouting about it. In the new world, that inverts.",
    source: "Jeff Bezos",
    tag: "product",
  },

  // ── Bill Gates ─────────────────────────────────────────────
  {
    text: "Your most unhappy customers are your greatest source of learning.",
    source: "Bill Gates",
    tag: "feedback",
  },
  {
    text: "We always overestimate the change that will occur in the next two years and underestimate the change that will occur in the next ten.",
    source: "Bill Gates",
    tag: "horizon",
  },
  {
    text: "Success is a lousy teacher. It seduces smart people into thinking they can't lose.",
    source: "Bill Gates",
    tag: "humility",
  },

  // ── Andrew Carnegie ────────────────────────────────────────
  {
    text: "The first man gets the oyster, the second man gets the shell.",
    source: "Andrew Carnegie",
    tag: "speed",
  },
  {
    text: "Do not look for approval except for the consciousness of doing your best.",
    source: "Andrew Carnegie",
    tag: "standards",
  },

  // ── Henry Ford ─────────────────────────────────────────────
  {
    text: "Whether you think you can, or you think you can't — you're right.",
    source: "Henry Ford",
    tag: "mindset",
  },
  {
    text: "If I had asked people what they wanted, they would have said faster horses.",
    source: "Henry Ford",
    tag: "product",
  },
  {
    text: "Failure is simply the opportunity to begin again, this time more intelligently.",
    source: "Henry Ford",
    tag: "iteration",
  },

  // ── Thomas Edison ──────────────────────────────────────────
  {
    text: "I have not failed. I've just found 10,000 ways that won't work.",
    source: "Thomas Edison",
    tag: "iteration",
  },
  {
    text: "Genius is one percent inspiration and ninety-nine percent perspiration.",
    source: "Thomas Edison",
    tag: "work",
  },
  {
    text: "Opportunity is missed by most people because it is dressed in overalls and looks like work.",
    source: "Thomas Edison",
    tag: "work",
  },

  // ── Nikola Tesla ───────────────────────────────────────────
  {
    text: "The present is theirs; the future, for which I really worked, is mine.",
    source: "Nikola Tesla",
    tag: "future",
  },
  {
    text: "I do not think there is any thrill that can go through the human heart like that felt by the inventor as he sees some creation of the brain unfolding to success.",
    source: "Nikola Tesla",
    tag: "build",
  },

  // ── Alan Kay (kept — computing pioneer) ────────────────────
  {
    text: "The best way to predict the future is to invent it.",
    source: "Alan Kay",
    tag: "invent",
  },
  {
    text: "A change in perspective is worth 80 IQ points.",
    source: "Alan Kay",
    tag: "thinking",
  },

  // ── Grace Hopper ───────────────────────────────────────────
  {
    text: "The most dangerous phrase in the language is, 'We've always done it this way.'",
    source: "Grace Hopper",
    tag: "change",
  },
  {
    text: "It's easier to ask forgiveness than it is to get permission.",
    source: "Grace Hopper",
    tag: "agency",
  },

  // ── Richard Feynman ────────────────────────────────────────
  {
    text: "The first principle is that you must not fool yourself — and you are the easiest person to fool.",
    source: "Richard Feynman",
    tag: "truth",
  },
  {
    text: "What I cannot create, I do not understand.",
    source: "Richard Feynman",
    tag: "build",
  },

  // ── Andy Grove (Intel) ─────────────────────────────────────
  {
    text: "Only the paranoid survive.",
    source: "Andy Grove",
    tag: "edge",
  },
  {
    text: "Success breeds complacency. Complacency breeds failure. Only the paranoid survive.",
    source: "Andy Grove",
    tag: "edge",
  },

  // ── Peter Thiel ────────────────────────────────────────────
  {
    text: "What important truth do very few people agree with you on?",
    source: "Peter Thiel",
    tag: "contrarian",
  },
  {
    text: "Competition is for losers.",
    source: "Peter Thiel",
    tag: "monopoly",
  },
  {
    text: "The most contrarian thing of all is not to oppose the crowd but to think for yourself.",
    source: "Peter Thiel",
    tag: "thinking",
  },

  // ── Larry Page ─────────────────────────────────────────────
  {
    text: "If you're not doing some things that are crazy, then you're doing the wrong things.",
    source: "Larry Page",
    tag: "ambition",
  },
  {
    text: "Always deliver more than expected.",
    source: "Larry Page",
    tag: "standards",
  },

  // ── Sergey Brin ────────────────────────────────────────────
  {
    text: "Obviously everyone wants to be successful, but I want to be looked back on as being very innovative, very trusted and ethical.",
    source: "Sergey Brin",
    tag: "legacy",
  },

  // ── Mark Zuckerberg ────────────────────────────────────────
  {
    text: "The biggest risk is not taking any risk. In a world that is changing really quickly, the only strategy that is guaranteed to fail is not taking risks.",
    source: "Mark Zuckerberg",
    tag: "risk",
  },
  {
    text: "Move fast and break things. Unless you are breaking stuff, you are not moving fast enough.",
    source: "Mark Zuckerberg",
    tag: "speed",
  },

  // ── Reid Hoffman ───────────────────────────────────────────
  {
    text: "If you are not embarrassed by the first version of your product, you've launched too late.",
    source: "Reid Hoffman",
    tag: "ship",
  },
  {
    text: "An entrepreneur is someone who will jump off a cliff and assemble an airplane on the way down.",
    source: "Reid Hoffman",
    tag: "founding",
  },

  // ── Paul Graham ────────────────────────────────────────────
  {
    text: "The way to get startup ideas is not to try to think of startup ideas. It's to look for problems, preferably problems you have yourself.",
    source: "Paul Graham",
    tag: "ideas",
  },
  {
    text: "You need three things to create a successful startup: to start with good people, to make something customers actually want, and to spend as little money as possible.",
    source: "Paul Graham",
    tag: "founding",
  },
  {
    text: "The best way to get startup ideas is to look at things that seem broken and fix them.",
    source: "Paul Graham",
    tag: "ideas",
  },
  {
    text: "Live in the future, then build what's missing.",
    source: "Paul Graham",
    tag: "future",
  },

  // ── Naval Ravikant ─────────────────────────────────────────
  {
    text: "Play long-term games with long-term people.",
    source: "Naval Ravikant",
    tag: "leverage",
  },
  {
    text: "Specific knowledge is knowledge that you cannot be trained for. If society can train you, it can train someone else, and replace you.",
    source: "Naval Ravikant",
    tag: "edge",
  },
  {
    text: "Earn with your mind, not your time.",
    source: "Naval Ravikant",
    tag: "leverage",
  },
  {
    text: "Desire is a contract you make with yourself to be unhappy until you get what you want.",
    source: "Naval Ravikant",
    tag: "mind",
  },

  // ── Sam Altman ─────────────────────────────────────────────
  {
    text: "It is easier to do a hard startup than an easy startup.",
    source: "Sam Altman",
    tag: "ambition",
  },
  {
    text: "You can usually hire your way out of a problem, but you can't hire your way to a vision.",
    source: "Sam Altman",
    tag: "vision",
  },
  {
    text: "Compound yourself.",
    source: "Sam Altman",
    tag: "compound",
  },
  {
    text: "Idea generation is a skill that improves with practice.",
    source: "Sam Altman",
    tag: "ideas",
  },
  {
    text: "You should be able to state your mission in one sentence.",
    source: "Sam Altman",
    tag: "clarity",
  },
  {
    text: "The hardest part of starting a company is surviving long enough for the world to change enough for your idea to work.",
    source: "Sam Altman",
    tag: "timing",
  },
  {
    text: "One of the most important tasks for a founder is to get the company to a point where it can survive without them.",
    source: "Sam Altman",
    tag: "systems",
  },
  {
    text: "Optimism, obsession, self-belief, raw horsepower and personal connections are how things get started.",
    source: "Sam Altman",
    tag: "founding",
  },
  {
    text: "Growth is the result of product people doing a great job.",
    source: "Sam Altman",
    tag: "product",
  },
  {
    text: "Don't worry about people stealing your ideas. If your ideas are any good, you'll have to ram them down people's throats.",
    source: "Sam Altman",
    tag: "ship",
  },

  // ── David Bowie (Goodreads pages 1–2, high-signal only) ────
  // https://www.goodreads.com/author/quotes/10360.David_Bowie
  {
    text: "I don't know where I'm going from here, but I promise it won't be boring.",
    source: "David Bowie",
    tag: "reinvent",
  },
  {
    text: "I always had a repulsive need to be something more than human. I felt very puny as a human. I thought, 'Fuck that. I want to be a superhuman.'",
    source: "David Bowie",
    tag: "ambition",
    weight: 3,
  },
  {
    text: "Tomorrow belongs to those who can hear it coming.",
    source: "David Bowie",
    tag: "future",
    weight: 2,
  },
  {
    text: "If you feel safe in the area you're working in, you're not working in the right area. Always go a little further into the water than you feel you're capable of being in. Go a little bit out of your depth. And when you don't feel that your feet are quite touching the bottom, you're just about in the right place to do something exciting.",
    source: "David Bowie",
    tag: "edge",
    weight: 3,
  },
  {
    text: "If it works, it's out of date.",
    source: "David Bowie",
    tag: "reinvent",
  },
  {
    text: "Speak in extremes, it'll save you time.",
    source: "David Bowie",
    tag: "clarity",
  },
  {
    text: "I'm just an individual who doesn't feel that I need to have somebody qualify my work in any particular way. I'm working for me.",
    source: "David Bowie",
    tag: "agency",
  },
  {
    text: "All my big mistakes are when I try to second-guess or please an audience. My work is always stronger when I get very selfish about it.",
    source: "David Bowie",
    tag: "craft",
  },
  {
    text: "The truth is, of course, that there is no journey. We are arriving and departing all at the same time.",
    source: "David Bowie",
    tag: "path",
  },
  {
    text: "As you get older the questions come down to two or three. How long have I got and what am I gonna do with the time I've got left?",
    source: "David Bowie",
    tag: "urgency",
  },
  {
    text: "Aging is an extraordinary process whereby you become the person you always should have been.",
    source: "David Bowie",
    tag: "becoming",
  },
  {
    text: "Once you lose that sense of wonder at being alive, you're pretty much on the way out.",
    source: "David Bowie",
    tag: "wonder",
  },
  {
    text: "I'm always amazed that people take what I say seriously. I don't even take what I am seriously.",
    source: "David Bowie",
    tag: "humor",
  },
  {
    text: "There's a terror in knowing what the world is about.",
    source: "David Bowie",
    tag: "truth",
  },
  {
    text: "We can be heroes just for one day.",
    source: "David Bowie",
    tag: "heroes",
  },
  {
    text: "Turn and face the strange.",
    source: "David Bowie",
    tag: "change",
  },
  {
    text: "I'm not a prophet or a stone aged man, just a mortal with potential of a superman. I'm living on.",
    source: "David Bowie",
    tag: "ambition",
  },
  {
    text: "Don't you love the Oxford Dictionary? When I first read it, I thought it was a really really long poem about everything.",
    source: "David Bowie",
    tag: "books",
  },
  {
    text: "I'm a real self-educated kind of guy. I read voraciously. Every book I ever bought, I have. I can't throw it away.",
    source: "David Bowie",
    tag: "learn",
  },
  {
    text: "The only art I'll ever study is stuff that I can steal from.",
    source: "David Bowie",
    tag: "craft",
  },
  {
    text: "It's always time to question what has become standard and established.",
    source: "David Bowie",
    tag: "change",
  },
  {
    text: "Confront a corpse at least once. The absolute absence of life is the most disturbing and challenging confrontation you will ever have.",
    source: "David Bowie",
    tag: "urgency",
  },
  {
    text: "All art is unstable. Its meaning is not necessarily that implied by the author. There is no authoritative active voice. There are only multiple readings.",
    source: "David Bowie",
    tag: "art",
  },
  {
    text: "I find only freedom in the realms of eccentricity.",
    source: "David Bowie",
    tag: "reinvent",
  },
  {
    text: "Sometimes I don't feel as if I'm a person at all. I'm just a collection of other people's ideas.",
    source: "David Bowie",
    tag: "identity",
  },
  {
    text: "I'm a person who can take on the guises of people I meet. I'm a collector, and I collect personalities and ideas.",
    source: "David Bowie",
    tag: "identity",
  },
  {
    text: "What I like my music to do to me is awaken the ghosts inside of me. Not the demons, you understand, but the ghosts.",
    source: "David Bowie",
    tag: "craft",
  },
  {
    text: "I can see light at the end of the tunnel and it isn't a train.",
    source: "David Bowie",
    tag: "hope",
  },
  {
    text: "Make the best of every moment. We're not evolving. We're not going anywhere.",
    source: "David Bowie",
    tag: "urgency",
  },
  {
    text: "And I don't care what anybody says; I like doing it, and it's what I shall continue to do.",
    source: "David Bowie",
    tag: "agency",
  },

  // ── Michael Jackson ────────────────────────────────────────
  {
    text: "The greatest education in the world is watching the masters at work.",
    source: "Michael Jackson",
    tag: "learn",
  },
  {
    text: "Lies run sprints, but the truth runs marathons.",
    source: "Michael Jackson",
    tag: "truth",
  },
  {
    text: "I'm a perfectionist; it's part of who I am.",
    source: "Michael Jackson",
    tag: "standards",
  },
  {
    text: "If you enter this world knowing you are loved and you leave this world knowing the same, then everything that happens in between can be dealt with.",
    source: "Michael Jackson",
    tag: "heart",
  },
  {
    // Keep — poetic craft, still real. Weight middling so harder lines surface more.
    text: "People ask me how I make music. I tell them I just step into it. It's like stepping into a river and joining the flow. Every moment in the river has its song.",
    source: "Michael Jackson",
    tag: "craft",
    weight: 2,
  },
  {
    text: "Consciousness expresses itself through creation. This world we live in is the dance of the creator. Dancers come and go in the twinkling of an eye but the dance lives on.",
    source: "Michael Jackson",
    tag: "create",
    weight: 2,
  },
  {
    text: "In a world filled with hate, we must still dare to hope. In a world filled with anger, we must still dare to comfort. In a world filled with despair, we must still dare to dream.",
    source: "Michael Jackson",
    tag: "hope",
  },
  {
    text: "To live is to be musical, starting with the blood dancing in your veins. Everything living has a rhythm. Do you feel your music?",
    source: "Michael Jackson",
    tag: "rhythm",
    weight: 2,
  },

  // ── Jensen Huang (NVIDIA) ──────────────────────────────────
  {
    text: "I wish upon you ample doses of pain and suffering.",
    source: "Jensen Huang",
    tag: "grit",
  },
  {
    text: "Greatness is not intelligence. Greatness comes from character.",
    source: "Jensen Huang",
    tag: "character",
  },

  // ── Satya Nadella ──────────────────────────────────────────
  {
    text: "Our industry does not respect tradition — it only respects innovation.",
    source: "Satya Nadella",
    tag: "innovate",
  },

  // ── Tim Cook ───────────────────────────────────────────────
  {
    text: "You want to be the pebble in the pond that creates the ripple for change.",
    source: "Tim Cook",
    tag: "impact",
  },

  // ── Sheryl Sandberg ────────────────────────────────────────
  {
    text: "Done is better than perfect.",
    source: "Sheryl Sandberg",
    tag: "ship",
  },

  // ── Marc Andreessen ────────────────────────────────────────
  {
    text: "Software is eating the world.",
    source: "Marc Andreessen",
    tag: "tech",
  },
  {
    text: "The spread of computers and the Internet will put jobs in two categories: people who tell computers what to do, and people who are told by computers what to do.",
    source: "Marc Andreessen",
    tag: "agency",
  },

  // ── Warren Buffett (capital allocator) ─────────────────────
  {
    text: "Someone's sitting in the shade today because someone planted a tree a long time ago.",
    source: "Warren Buffett",
    tag: "compound",
  },
  {
    text: "Price is what you pay. Value is what you get.",
    source: "Warren Buffett",
    tag: "capital",
  },
  {
    text: "The most important investment you can make is in yourself.",
    source: "Warren Buffett",
    tag: "self",
  },

  // ── Charlie Munger ─────────────────────────────────────────
  {
    text: "Spend each day trying to be a little wiser than you were when you woke up.",
    source: "Charlie Munger",
    tag: "learn",
  },
  {
    text: "The big money is not in the buying and selling, but in the waiting.",
    source: "Charlie Munger",
    tag: "patience",
  },
  {
    text: "Invert, always invert.",
    source: "Charlie Munger",
    tag: "thinking",
  },

  // ── Ada Lovelace ───────────────────────────────────────────
  {
    text: "That brain of mine is something more than merely mortal; as time will show.",
    source: "Ada Lovelace",
    tag: "ambition",
  },

  // ── Claude Shannon ─────────────────────────────────────────
  {
    text: "I visualize a time when we will be to robots what dogs are to humans. And I am rooting for the machines.",
    source: "Claude Shannon",
    tag: "future",
  },

  // ── David Packard (HP) ─────────────────────────────────────
  {
    text: "Marketing is too important to be left to the marketing department.",
    source: "David Packard",
    tag: "product",
  },

  // ── Edwin Land (Polaroid — Jobs idol) ──────────────────────
  {
    text: "Don't do anything that someone else can do. Don't undertake a project unless it is manifestly important and nearly impossible.",
    source: "Edwin Land",
    tag: "ambition",
  },
  {
    text: "The most important thing about power is to make sure you don't have to use it.",
    source: "Edwin Land",
    tag: "power",
  },

  // ── James Dyson ────────────────────────────────────────────
  {
    text: "Enjoy failure and learn from it. You can never learn from success.",
    source: "James Dyson",
    tag: "iteration",
  },

  // ── Walt Disney ────────────────────────────────────────────
  // https://www.goodreads.com/quotes/tag/walt-disney
  // + author quotes bank — real Walt lines, no movie-lyric misattributes
  {
    text: "Whatever you do, do it well. Do it so well that when people see you do it, they will want to come back and see you do it again, and they will want to bring others and show them how well you do what you do.",
    source: "Walt Disney",
    tag: "craft",
  },
  {
    text: "The difference between winning and losing is most often not quitting.",
    source: "Walt Disney",
    tag: "grit",
  },
  {
    text: "Laughter is timeless. Imagination has no age. And dreams are forever.",
    source: "Walt Disney",
    tag: "imagination",
  },
  {
    text: "It's kind of fun to do the impossible.",
    source: "Walt Disney",
    tag: "ambition",
  },
  {
    text: "The way to get started is to quit talking and begin doing.",
    source: "Walt Disney",
    tag: "ship",
  },
  {
    text: "All our dreams can come true, if we have the courage to pursue them.",
    source: "Walt Disney",
    tag: "courage",
  },
  {
    text: "There is more treasure in books than in all the pirates' loot on Treasure Island and best of all, you can enjoy these riches every day of your life.",
    source: "Walt Disney",
    tag: "books",
  },
  {
    text: "If you can dream it, you can do it. Always remember that this whole thing was started with a dream and a mouse.",
    source: "Walt Disney",
    tag: "ambition",
  },
  {
    text: "Around here, however, we don't look backwards for very long. We keep moving forward, opening up new doors and doing new things, because we're curious — and curiosity keeps leading us down new paths.",
    source: "Walt Disney",
    tag: "build",
  },
  {
    text: "The more you like yourself, the less you are like anyone else, which makes you unique.",
    source: "Walt Disney",
    tag: "self",
  },
  {
    text: "When you're curious, you find lots of interesting things to do.",
    source: "Walt Disney",
    tag: "curiosity",
  },
  {
    text: "All the adversity I've had in my life, all my troubles and obstacles, have strengthened me. You may not realize it when it happens, but a kick in the teeth may be the best thing in the world for you.",
    source: "Walt Disney",
    tag: "grit",
  },
  {
    text: "Disneyland will never be completed. It will continue to grow as long as there is imagination left in the world.",
    source: "Walt Disney",
    tag: "vision",
  },
  {
    text: "Somehow I can't believe that there are any heights that can't be scaled by a man who knows the secrets of making dreams come true. This special secret, it seems to me, can be summarized in four Cs. They are curiosity, confidence, courage, and constancy — and the greatest of all is confidence. When you believe in a thing, believe in it all the way, implicitly and unquestionably.",
    source: "Walt Disney",
    tag: "belief",
  },
  {
    text: "I would rather entertain and hope that people learned something than educate people and hope they were entertained.",
    source: "Walt Disney",
    tag: "product",
  },
  {
    text: "You're dead if you aim only for kids. Adults are only kids grown up, anyway.",
    source: "Walt Disney",
    tag: "audience",
  },
  {
    text: "When you believe in a thing, believe in it all the way, implicitly and unquestionably.",
    source: "Walt Disney",
    tag: "belief",
  },
  {
    text: "I always like to look on the optimistic side of life, but I am realistic enough to know that life is a complex matter.",
    source: "Walt Disney",
    tag: "mindset",
  },
  {
    text: "Fantasy, if it's really convincing, can't become dated, for the simple reason that it represents a flight into a dimension that lies beyond the reach of time.",
    source: "Walt Disney",
    tag: "craft",
  },
  {
    text: "Here is the world of imagination, hopes, and dreams. In this timeless land of enchantment, the age of chivalry, magic and make-believe are reborn — and fairy tales come true.",
    source: "Walt Disney",
    tag: "vision",
  },
  {
    text: "You can design and create, and build the most wonderful place in the world. But it takes people to make the dream a reality.",
    source: "Walt Disney",
    tag: "build",
  },
  {
    text: "We keep moving forward, opening new doors, and doing new things, because we're curious and curiosity keeps leading us down new paths.",
    source: "Walt Disney",
    tag: "curiosity",
  },
  {
    text: "Get a good idea and stay with it. Dog it, and work at it until it's done right.",
    source: "Walt Disney",
    tag: "grit",
  },

];

/**
 * Source bias — heroes land more often.
 * Per-quote `weight` stacks on top for zing lines.
 */
const FAVORITE_WEIGHT: Record<string, number> = {
  "David Bowie": 3,
  "Michael Jackson": 2,
  "Steve Jobs": 3,
  "Elon Musk": 3,
  "Sam Altman": 2,
  "Walt Disney": 2,
  "Grace Hopper": 2,
  "Edwin Land": 2,
  "Naval Ravikant": 2,
  "Paul Graham": 2,
  "Richard Feynman": 2,
};

/** 6 hours in ms — private slot length (not shown in UI). */
const QUOTE_SLOT_MS = 6 * 60 * 60 * 1000;
const PRIVATE_EPOCH_KEY = "wonder.quote.privateEpoch.v1";

/**
 * Drop slogan-thin + soft-poster lines that waste the surface.
 * Keep transcendable craft / edge / agency lines.
 */
function isStrongQuote(q: DailyQuote): boolean {
  const t = q.text.trim();
  if (t.length < 40) return false;
  if (/^[\w\s]+=[\w\s]+[.!]?$/i.test(t)) return false;
  if (/^software is eating the world/i.test(t)) return false;
  if (/^competition is for losers/i.test(t)) return false;
  if (/^only the paranoid survive\.?$/i.test(t)) return false;
  if (/^done is better than perfect/i.test(t)) return false;
  if (/^make something people want/i.test(t)) return false;
  if (/^real artists ship\.?$/i.test(t)) return false;
  if (/^stay hungry\.?\s*stay foolish/i.test(t)) return false;
  if (/^compound yourself\.?$/i.test(t)) return false;
  // Soft / thin — no zing for a founder surface
  if (/^i'?m a perfectionist/i.test(t)) return false;
  if (/^laughter is timeless/i.test(t)) return false;
  if (/^all our dreams can come true/i.test(t)) return false;
  if (/^it'?s kind of fun to do the impossible/i.test(t)) return false;
  if (/^when you'?re curious, you find lots/i.test(t)) return false;
  if (/^the more you like yourself/i.test(t)) return false;
  if (/^we can be heroes just for one day/i.test(t)) return false;
  if (/^turn and face the strange/i.test(t)) return false;
  return true;
}

/** Weighted bank: favorites + high-zing lines land more often. */
function rotationBank(): DailyQuote[] {
  const out: DailyQuote[] = [];
  for (const q of HERO_QUOTES) {
    if (!isStrongQuote(q)) continue;
    const sourceW = FAVORITE_WEIGHT[q.source] ?? 1;
    const lineW = Math.max(1, Math.min(4, q.weight ?? 1));
    // Product of source bias × line zing (capped so one line doesn't dominate)
    const w = Math.min(8, sourceW * lineW);
    for (let i = 0; i < w; i++) out.push(q);
  }
  return out.length ? out : HERO_QUOTES;
}

/**
 * Personal epoch — first open sets the clock; then every 6h a new slot.
 * Stored locally; never shown in UI.
 */
function privateEpochMs(): number {
  if (typeof localStorage === "undefined") {
    // SSR / non-browser: wall-clock 6h buckets
    const now = Date.now();
    return now - (now % QUOTE_SLOT_MS);
  }
  try {
    const raw = localStorage.getItem(PRIVATE_EPOCH_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const now = Date.now();
    localStorage.setItem(PRIVATE_EPOCH_KEY, String(now));
    return now;
  } catch {
    const now = Date.now();
    return now - (now % QUOTE_SLOT_MS);
  }
}

/**
 * Stable slot key for the current (or given) moment.
 * Format is opaque — do not display this to the user.
 */
export function quoteSlotKey(d = new Date()): string {
  const epoch = privateEpochMs();
  const slot = Math.floor((d.getTime() - epoch) / QUOTE_SLOT_MS);
  return `q6:${slot}`;
}

/** @deprecated use quoteSlotKey — kept so older imports still typecheck */
export function localDayKey(d = new Date()): string {
  return quoteSlotKey(d);
}

/** Stable int hash of a string (slot → index). */
function hashSlot(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Quote for a given 6-hour private slot.
 * Same slot always returns the same quote (refresh-safe).
 */
export function quoteForSlot(slotKey: string = quoteSlotKey()): DailyQuote {
  const list = rotationBank();
  if (!list.length) {
    return {
      text: "Build something that outlasts you.",
      source: "Wonder",
    };
  }
  const idx = hashSlot(slotKey) % list.length;
  return list[idx];
}

/** @deprecated alias — same as quoteForSlot */
export function quoteForDay(dayKey: string = quoteSlotKey()): DailyQuote {
  return quoteForSlot(dayKey);
}

/** Current quote for UI — just text + source, no timer chrome. */
export function todayQuote(): DailyQuote {
  return quoteForSlot(quoteSlotKey());
}

/** ms until the private 6h slot flips (for silent background refresh). */
export function msUntilNextQuoteSlot(d = new Date()): number {
  const epoch = privateEpochMs();
  const elapsed = d.getTime() - epoch;
  const into = ((elapsed % QUOTE_SLOT_MS) + QUOTE_SLOT_MS) % QUOTE_SLOT_MS;
  return QUOTE_SLOT_MS - into;
}
