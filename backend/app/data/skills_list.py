"""
Reference list of common freelance skills, grouped by category.

Used to (1) power skill autocomplete in the profile wizard and (2) extract skills from a
job description when the source gives no skills list. These are real skill names
(the kind of tags used on Freelancer.com / Upwork), not invented data.
"""

SKILLS_BY_CATEGORY: dict[str, list[str]] = {
    "Web Development": [
        "HTML", "CSS", "JavaScript", "TypeScript", "React", "Next.js", "Vue.js", "Nuxt.js", "Angular",
        "Svelte", "jQuery", "Tailwind CSS", "Bootstrap", "Sass", "Redux", "Node.js", "Express.js",
        "NestJS", "PHP", "Laravel", "CodeIgniter", "Symfony", "WordPress", "WooCommerce", "Shopify",
        "Magento", "Wix", "Webflow", "Squarespace", "Elementor", "Drupal", "Joomla", "Django", "Flask",
        "FastAPI", "Ruby on Rails", "ASP.NET", "Spring Boot", "GraphQL", "REST API", "Web Scraping",
        "Website Design", "Landing Page", "Responsive Design", "Web Accessibility", "SEO Optimization",
        "Chrome Extension", "Progressive Web App", "WebSockets", "Three.js", "Gatsby", "Vite",
    ],
    "Programming Languages": [
        "Python", "Java", "C#", "C++", "C", "Go", "Rust", "Ruby", "Kotlin", "Swift", "Dart", "Scala",
        "R", "MATLAB", "Perl", "Bash", "PowerShell", "Solidity", "Lua", "Elixir", "Haskell", "VBA",
    ],
    "Mobile Development": [
        "Android", "iOS", "Flutter", "React Native", "Ionic", "Xamarin", "SwiftUI", "Jetpack Compose",
        "Mobile App Development", "App Store Optimization", "Firebase", "Expo",
    ],
    "Databases & Cloud": [
        "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Oracle", "Microsoft SQL Server",
        "Elasticsearch", "Supabase", "DynamoDB", "Cassandra", "AWS", "Microsoft Azure", "Google Cloud Platform",
        "Docker", "Kubernetes", "Terraform", "Ansible", "Linux", "Nginx", "Apache", "CI/CD", "GitHub Actions",
        "Jenkins", "DevOps", "Serverless", "AWS Lambda", "Heroku", "Vercel", "Netlify", "Cloudflare",
        "Git", "System Administration", "Network Administration", "Cybersecurity", "Penetration Testing",
    ],
    "Data & AI": [
        "Machine Learning", "Deep Learning", "Data Science", "Data Analysis", "Data Visualization",
        "Data Engineering", "Data Entry", "Data Mining", "Natural Language Processing", "Computer Vision",
        "TensorFlow", "PyTorch", "Keras", "scikit-learn", "Pandas", "NumPy", "OpenCV", "Hugging Face",
        "LangChain", "OpenAI API", "ChatGPT", "Prompt Engineering", "Large Language Models", "AI Chatbot",
        "Generative AI", "Statistics", "Power BI", "Tableau", "Looker Studio", "Excel", "Google Sheets",
        "Apache Spark", "Airflow", "ETL", "BigQuery", "Snowflake", "Jupyter", "Time Series Analysis",
        "Predictive Modeling", "Recommendation Systems", "Speech Recognition", "MLOps",
    ],
    "Design & Creative": [
        "Graphic Design", "Logo Design", "UI Design", "UX Design", "UI/UX Design", "Figma", "Adobe XD",
        "Sketch", "Adobe Photoshop", "Adobe Illustrator", "Adobe InDesign", "Canva", "Brand Identity",
        "Illustration", "Infographics", "Banner Design", "Packaging Design", "Print Design", "Poster Design",
        "Business Card Design", "Book Cover Design", "T-Shirt Design", "Icon Design", "Wireframing",
        "Prototyping", "Web Design", "Mobile App Design", "3D Modeling", "Blender", "Autodesk Maya",
        "3ds Max", "AutoCAD", "SolidWorks", "SketchUp", "Interior Design", "Architecture", "Product Design",
        "Animation", "2D Animation", "Motion Graphics", "Adobe After Effects", "Video Editing",
        "Adobe Premiere Pro", "Final Cut Pro", "DaVinci Resolve", "Photo Editing", "Photo Retouching",
        "Photography", "Videography", "Character Design", "Game Design", "Unity", "Unreal Engine",
    ],
    "Writing & Translation": [
        "Content Writing", "Copywriting", "Blog Writing", "Article Writing", "Technical Writing",
        "Creative Writing", "Ghostwriting", "Proofreading", "Editing", "SEO Writing", "Product Descriptions",
        "Academic Writing", "Research Writing", "Resume Writing", "Cover Letter Writing", "Grant Writing",
        "Scriptwriting", "Email Copywriting", "Translation", "English Translation", "Arabic Translation",
        "Spanish Translation", "French Translation", "German Translation", "Urdu Translation",
        "Chinese Translation", "Transcription", "Subtitles", "Business Writing", "Report Writing",
        "Newsletter Writing", "UX Writing", "Documentation",
    ],
    "Marketing & Sales": [
        "Digital Marketing", "Social Media Marketing", "Social Media Management", "Facebook Ads",
        "Instagram Marketing", "TikTok Marketing", "LinkedIn Marketing", "Google Ads", "Google Analytics",
        "Search Engine Marketing", "Search Engine Optimization", "Local SEO", "Link Building",
        "Keyword Research", "Email Marketing", "Mailchimp", "Klaviyo", "HubSpot", "Salesforce",
        "Marketing Strategy", "Content Marketing", "Affiliate Marketing", "Influencer Marketing",
        "Lead Generation", "Market Research", "Brand Strategy", "Public Relations", "Growth Hacking",
        "Conversion Rate Optimization", "Amazon FBA", "Amazon Seller Central", "eBay", "Etsy",
        "E-commerce", "Dropshipping", "Telemarketing", "Cold Calling", "Sales", "CRM",
        "YouTube Marketing", "Pinterest Marketing", "Podcast Production",
    ],
    "Business & Support": [
        "Virtual Assistant", "Customer Support", "Project Management", "Agile", "Scrum", "Jira", "Trello",
        "Notion", "Business Analysis", "Business Plan", "Financial Analysis", "Financial Modeling",
        "Accounting", "Bookkeeping", "QuickBooks", "Xero", "Tax Preparation", "Payroll",
        "Legal Writing", "Contract Drafting", "Human Resources", "Recruiting", "Administrative Support",
        "Microsoft Office", "Microsoft Word", "PowerPoint", "Presentation Design", "Zapier", "Make.com",
        "Airtable", "Automation", "Product Management", "Consulting", "Event Planning",
    ],
    "Engineering & Other Tech": [
        "Embedded Systems", "Arduino", "Raspberry Pi", "IoT", "PCB Design", "Electrical Engineering",
        "Mechanical Engineering", "Civil Engineering", "Blockchain", "Smart Contracts", "Web3", "NFT",
        "Cryptocurrency", "Game Development", "AR/VR", "Software Testing", "QA Testing", "Selenium",
        "Cypress", "Playwright", "Unit Testing", "Automation Testing", "API Development", "Microservices",
        "Software Architecture", "Desktop Application", "Electron", ".NET", "Qt", "Visual Basic",
        "Odoo", "SAP", "ERP", "Salesforce Development", "Power Automate", "Google Apps Script",
        "Bot Development", "Telegram Bot", "Discord Bot", "Payment Gateway Integration", "Stripe",
        "Twilio", "Maps API", "Audio Editing", "Voice Over", "Music Production", "Sound Design",
    ],
}


def all_skills() -> list[tuple[str, str]]:
    """Return (name, category) pairs with duplicates removed (case-insensitive)."""
    seen: set[str] = set()
    result: list[tuple[str, str]] = []
    for category, names in SKILLS_BY_CATEGORY.items():
        for name in names:
            key = name.lower()
            if key not in seen:
                seen.add(key)
                result.append((name, category))
    return result
