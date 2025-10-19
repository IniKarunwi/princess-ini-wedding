import { useState } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import StatsBar from "@/components/StatsBar";
import JobCard from "@/components/JobCard";
import ProjectCard from "@/components/ProjectCard";
import SpeakingCard from "@/components/SpeakingCard";
import ContactModal from "@/components/ContactModal";
import miniTranslateImage from "@/assets/mini-translate.jpeg";
import roomspaceImage from "@/assets/roomspace.jpeg";
import trustlensImage from "@/assets/trustlens.jpeg";
import resideSummitImage from "@/assets/reside-summit.jpeg";
import arceConferenceImage from "@/assets/arce-conference.jpeg";
import skyewiseImage from "@/assets/skyewise-foundation.jpeg";
import trefordImage from "@/assets/treford-masterclass.jpeg";
import actconImage from "@/assets/actcon.jpeg";
import moneyAfricaImage from "@/assets/money-africa.jpeg";

const Index = () => {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Navbar onContactClick={() => setContactOpen(true)} />
      
      <Hero />

      <StatsBar />

      {/* Career History */}
      <section id="career" className="py-20 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-4 text-center"
          >
            Career History
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-center mb-12"
          >
            Launched ideas and scaled teams across product, community, and no-code.
          </motion.p>

          <div className="space-y-6">
            <JobCard 
              title="ProptechBuzz.com" 
              role="Global Lead, Growth & Partnerships" 
              delay={0}
              expandedContent={
                <>
                  <p className="font-semibold text-foreground">Product Manager to Global Lead of Growth and Partnerships | 2023 - Present</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Started as a product manager, focusing on MVP development and early-stage product scaling. Conducted regular client feedback sessions, leading to a 20% increase in product usage and a 15% boost in customer referrals.</li>
                    <li>Promoted to Global Lead of Growth and Partnerships, closing 5 major conference partnerships, highest in Q2 - Q4, and growing the internal community from 0 to 6,000 members.</li>
                    <li>Planned the discovery and execution of our MVP product (proptechbuzz.com) with the main module built in React and the media module built with WordPress which went live within 3 months.</li>
                    <li>Played a pivotal role in coordinating the cross-functional team of developers, marketers, sales, designers, and QA engineers using tools like Click-up, Linear, and Google Suite tools with major feature releases happening weekly.</li>
                    <li>Conducted regular client review calls and implemented new ideas and features that grew business revenue by $120,000 ARR, focusing on community-building and ad-hoc marketing offerings.</li>
                  </ul>
                </>
              }
            >
              <p>
                First Product Manager from idea → execution (web + v1 mobile). Grew 0 → 15,000 innovators in 20+ countries;
                media reach 250k+. Drove partnerships with Africa Valuation Conference, Reside Summit (South Africa),
                AREA (Uganda), Global Proptech Summit (Saudi Arabia), and more.
              </p>
            </JobCard>

            <JobCard 
              title="WeLoveNoCode (acquired by Toptal)" 
              role="Product Manager" 
              delay={0.1}
              expandedContent={
                <>
                  <p className="font-semibold text-foreground">Product Manager to Head of Client Success | 2021 - 2023</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Initially joined as a Product Manager, leading product development, client engagement, and agile project management efforts across multiple projects.</li>
                    <li>Promoted to Head of Client Success within a year due to strong client relationships and repeat business, driving monthly revenue from $500k to $3M in MRR and achieving the highest NPS and CSAT scores.</li>
                    <li>Led a cross-functional team of developers, designers, marketing, sales, and QA, ensuring the smooth translation of business requirements into technical documents (PRDs, user stories, flow diagrams, wireframes).</li>
                    <li>Managed the largest portfolio of product development clients &gt;50% of the company's portfolio with the highest reactivation percentage of &gt;70%.</li>
                    <li>Built more than 50 MVP websites and mobile apps with different client projects over different No-code stacks like Bubble, Webflow, WordPress, Adalo, Flutterflow, etc.</li>
                  </ul>
                </>
              }
            >
              <p>
                Led cross-functional squads shipping 50+ MVPs. Company scaled $500k → $3M ARR;
                my portfolio contributed 60%+ of MRR.
              </p>
            </JobCard>

            <JobCard 
              title="Bojale Labs" 
              role="Product Owner" 
              delay={0.2}
              expandedContent={
                <>
                  <p className="font-semibold text-foreground">Product Manager | 2020 - 2021</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Initially joined as a Product Manager, developing and optimizing MVP features, which led to a 40% reduction in development time and a 50% increase in user engagement.</li>
                    <li>Promoted to Product Owner, refining agile processes, implementing a product analytics tool, and improving retention rates by 25%.</li>
                  </ul>
                </>
              }
            >
              <p className="mb-3">Executed multi-product roadmap including:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <a href="https://www.notion.so/29f6d680faa94ade9a877fdd32165473?pvs=21" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Capital Rollup (Crypto)
                  </a>
                </li>
                <li>
                  <a href="https://www.getkiddiebox.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    GetKiddieBox
                  </a>
                </li>
                <li>
                  <a href="https://krakenedu.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    KrakenEdu
                  </a>
                </li>
                <li>
                  <a href="https://unfinished.stream/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Unfinished
                  </a>
                </li>
              </ul>
            </JobCard>

            <JobCard title="Other Collaborations" delay={0.3}>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <a href="https://aerdf.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    AERDF (BMGF)
                  </a>
                </li>
                <li>
                  <a href="https://www.notion.so/My-website-content-2901f09e7a2f8096b147c2fcc1cea2a4?pvs=21" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Babafi
                  </a>
                </li>
                <li>
                  <a href="https://www.notion.so/2401f09e7a2f8021956ef12643fcf893?pvs=21" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Digital Ark
                  </a>
                </li>
                <li>
                  <a href="https://astutewealthplanning.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Astute Planning
                  </a>
                </li>
              </ul>
            </JobCard>
          </div>
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="py-20 px-6 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-4 text-center"
          >
            Side Projects
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-center mb-12"
          >
            A mix of shipped work and prototypes — Bubble.io & Lovable.dev
          </motion.p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ProjectCard
              title="Mini translate app"
              description="Translate from English to other languages"
              href="https://lovable.dev/projects/a31080e1-313b-43ae-8b0a-d04d36689b7e"
              delay={0}
              image={miniTranslateImage}
            />
            <ProjectCard
              title="RoomSpace"
              description="Redesign your room in seconds"
              href="https://lovable.dev/projects/41a4bb3d-44ef-4527-b4ab-8a6823a9de38"
              delay={0.1}
              image={roomspaceImage}
            />
            <ProjectCard
              title="TrustLens"
              description="Verify product authenticity with AI-powered analysis"
              href="https://lovable.dev/projects/577778dc-bbff-48d4-b546-970ccd05da2c"
              delay={0.2}
              image={trustlensImage}
            />
          </div>
        </div>
      </section>

      {/* Speaking */}
      <section id="speaking" className="py-20 px-6 bg-[#0B0F0C] relative overflow-hidden">
        {/* Gradient accent background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-4 text-center"
          >
            Speaking Engagements
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-center mb-12"
          >
            Talks and sessions on product management, AI, community growth, and digital innovation.
          </motion.p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SpeakingCard 
              title="Reside Summit" 
              description="Presented on digital transformation and community growth in PropTech."
              href="https://residesummit.co.za/" 
              delay={0}
              image={resideSummitImage}
            />
            <SpeakingCard 
              title="ARCE Conference" 
              description="Speaker at the Africa Real Estate Conference & Expo (ARCE 2024), Ghana."
              href="https://arceconference.com/" 
              delay={0.1}
              image={arceConferenceImage}
            />
            <SpeakingCard 
              title="Skyewise Foundation" 
              description="Delivered a session on digital skills and training for entrepreneurs."
              href="https://skyewise.com.ng/" 
              delay={0.2}
              image={skyewiseImage}
            />
            <SpeakingCard 
              title="Treford Africa" 
              description="Taught effective strategies for staying updated in product ecosystems."
              href="https://treford.africa/" 
              delay={0.3}
              image={trefordImage}
            />
            <SpeakingCard 
              title="Act+ Con" 
              description="Panelist on place branding, storytelling, and influencer strategy."
              href="https://emmanuelolugbemi.com/actcon" 
              delay={0.4}
              image={actconImage}
            />
            <SpeakingCard 
              title="Money Africa" 
              description="Panelist for Money Africa Student Community Career Series."
              href="https://themoneyafrica.com/" 
              delay={0.5}
              image={moneyAfricaImage}
            />
          </div>
        </div>
      </section>

      {/* Teaching */}
      <section id="teaching" className="py-20 px-6 bg-secondary/30">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold mb-4 text-center"
          >
            Treford Africa — Faculty
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-center mb-12"
          >
            I teach in AI Product Management and the Product Management Accelerator (2022—present).
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-2xl p-8"
          >
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="text-primary text-xl">✓</span>
                <span>AI Product Development</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary text-xl">✓</span>
                <span>Introduction to Product Management</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary text-xl">✓</span>
                <span>Product Positioning</span>
              </li>
            </ul>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-background border-t border-border">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-muted-foreground mb-4">© 2025 Ini Karunwi</p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <a href="https://www.linkedin.com/in/inioluwa-karunwi/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              LinkedIn
            </a>
            <span className="text-muted-foreground">•</span>
            <a href="https://medium.com/@ini-karunwi" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Medium
            </a>
            <span className="text-muted-foreground">•</span>
            <a href="mailto:joel.karunwini@gmail.com" className="text-primary hover:underline">
              Email
            </a>
          </div>
        </div>
      </footer>

      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </div>
  );
};

export default Index;
