# 🚀 Quick Start Guide - MarketMind AI

## For Immediate Testing (Without Supabase)

If you want to test the UI immediately without setting up Supabase:

### 1. **Start the Frontend Only**
```bash
npm run dev
```
This will start the React development server at `http://localhost:5173`

### 2. **Access the Application**
- Go to http://localhost:5173
- You'll see the beautiful login page
- The backend API is not required for UI testing

## For Full Backend Integration

### Step 1: Setup Supabase
1. Visit https://supabase.com and create a free account
2. Create a new project
3. Go to SQL Editor and copy-paste the entire content from `database/schema.sql`
4. Get your credentials from Settings → API

### Step 2: Configure Environment
Create `.env` file:
```env
VITE_API_URL=http://localhost:8000/api
VITE_SOCKET_URL=http://localhost:8000
VITE_SUPABASE_URL=your_url_here
VITE_SUPABASE_ANON_KEY=your_key_here
```

### Step 3: Run Backend
```bash
npm run server:dev
```

### Step 4: Run Frontend (in another terminal)
```bash
npm run dev
```

---

## 🎨 What's Already Implemented

### ✅ Frontend Features
- Modern gradient UI with animations
- Dashboard with real-time metrics
- Product management UI
- Price tracking charts
- Review intelligence cards
- Competitor radar interface
- Logistics dashboard
- Real-time alerts
- User authentication pages
- Responsive design

### ✅ Backend Features
- 8 complete API route modules
- JWT authentication
- Real-time WebSocket support
- Database schema ready
- Error handling
- Rate limiting
- CORS protection

### ✅ Database
- Users table with profile
- Products tracking
- Prices history
- Competitors monitoring
- Reviews analysis
- Insights generation
- Logistics tracking
- Alerts & notifications

---

## 📝 Test Credentials (After Backend Setup)

**For Testing New Account:**
- Email: test@example.com
- Password: TestPassword123
- Company: Test Company

**Register** → **Login** → **Dashboard**

---

## 🔧 Working Features

After setting up the backend:

✅ **Authentication**
- Register new accounts
- Login/Logout
- Profile management
- JWT token handling

✅ **Products**
- Add/edit/delete products
- View product list
- Track multiple products

✅ **Real-time Updates**
- Instant notifications
- Live price updates
- New insights alerts
- Real-time dashboard refresh

✅ **Analytics**
- Price trend charts
- Sentiment analysis
- Competitor comparison
- Revenue tracking

---

## 🐛 Troubleshooting

**Port 8000 already in use?**
```bash
lsof -i :8000
kill -9 <PID>
```

**Supabase connection failed?**
- Check your VITE_SUPABASE_URL is correct
- Check VITE_SUPABASE_ANON_KEY
- Ensure Supabase project is active

**WebSocket not connecting?**
- Check backend is running on port 8000
- Check VITE_SOCKET_URL in .env
- Check browser console for errors

**Database migrations not applied?**
- Log into Supabase
- Go to SQL Editor
- Copy-paste the entire `database/schema.sql`
- Run the script

---

## 📞 Quick Commands

```bash
# Install dependencies
npm install

# Frontend dev
npm run dev

# Frontend build
npm run build

# Backend dev (with hot reload)
npm run server:dev

# Backend production
npm run server
```

---

## 🎯 Navigation After Login

Use the left sidebar to navigate between:
- **Dashboard** - Overview and key metrics
- **Price Tracker** - Compare prices with competitors
- **Review Intelligence** - Sentiment analysis
- **Competitor Radar** - Track competitor activities
- **Logistics** - Shipping cost optimization
- **Insights Feed** - AI recommendations
- **Notifications** - Real-time alerts

---

## 🎯 Next Actions

1. **Test the UI** - `npm run dev`
2. **Setup Supabase** - Create project and run schema.sql
3. **Connect Backend** - Update .env with credentials
4. **Run Full Stack** - Backend + Frontend
5. **Create Test Products** - Use the dashboard
6. **Generate Insights** - Backend AI processing
7. **Monitor Real-time** - WebSocket updates

---

**Questions?** Check `DEPLOYMENT_GUIDE.md` for detailed documentation.

Happy coding! 🚀### Logistics Intelligence
- Compare shipping providers
- View cost trends
- Review optimization recommendations

### Insights Feed
- Filter insights by category
- Check urgency and confidence scores
- Provide feedback on insights

### Notifications
- Filter by category or unread status
- View priority indicators
- Mark notifications as read

## Customization

To customize the app:
- **Colors**: Edit CSS files in `src/pages/` and `src/components/`
- **Data**: Modify the mock data in each page component
- **Layout**: Adjust `src/components/Layout.jsx`
- **Routes**: Update `src/App.jsx`

## Tips

- The sidebar is collapsible - click the menu icon
- All charts are interactive - hover for details
- The app uses mock data - replace with real API calls
- Authentication is simulated - implement real auth as needed
