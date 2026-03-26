import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Truck, 
  Users, 
  Plus, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  IndianRupee, 
  CreditCard,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Pencil
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Vendor, Product, Purchase, Sale, EventSale, InventoryItem, DashboardData, Event } from './types';
import { LogOut, Download, Lock } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'purchases' | 'inventory' | 'vendors' | 'event-pos' | 'repository'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      handleLogout();
      throw new Error('Unauthorized');
    }
    return response;
  };

  const fetchData = async () => {
    if (!token) return;
    try {
      const [dash, v, p, pur, s, inv] = await Promise.all([
        fetchWithAuth('/api/dashboard').then(r => r.json()),
        fetchWithAuth('/api/vendors').then(r => r.json()),
        fetchWithAuth('/api/products').then(r => r.json()),
        fetchWithAuth('/api/purchases').then(r => r.json()),
        fetchWithAuth('/api/sales').then(r => r.json()),
        fetchWithAuth('/api/inventory').then(r => r.json())
      ]);
      setDashboardData(dash);
      setVendors(v);
      setProducts(p);
      setPurchases(pur);
      setSales(s);
      setInventory(inv);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      setIsLoggedIn(true);
      fetchData();
    } else {
      setIsLoggedIn(false);
      setLoading(false);
    }
  }, [token]);

  const handleLogin = async (password: string) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('admin_token', data.token);
        setToken(data.token);
      } else {
        alert('Invalid password');
      }
    } catch (error) {
      alert('Login failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
    setIsLoggedIn(false);
  };

  const handleExport = async (type: string) => {
    try {
      const response = await fetchWithAuth(`/api/export/${type}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'database' ? 'business_backup.db' : `${type}_export.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (!isLoggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView data={dashboardData} onExport={() => handleExport('database')} />;
      case 'sales':
        return <SalesView sales={sales} products={products} onUpdate={fetchData} onExport={() => handleExport('sales')} fetchWithAuth={fetchWithAuth} />;
      case 'purchases':
        return <PurchasesView purchases={purchases} vendors={vendors} products={products} onUpdate={fetchData} onExport={() => handleExport('purchases')} fetchWithAuth={fetchWithAuth} />;
      case 'inventory':
        return <InventoryView inventory={inventory} products={products} onUpdate={fetchData} onExport={() => handleExport('inventory')} fetchWithAuth={fetchWithAuth} />;
      case 'vendors':
        return <VendorsView vendors={vendors} purchases={purchases} onUpdate={fetchData} onExport={() => handleExport('vendors')} fetchWithAuth={fetchWithAuth} />;
      case 'event-pos':
        return <EventPOSView products={products} onUpdate={fetchData} fetchWithAuth={fetchWithAuth} />;
      case 'repository':
        return <ProductRepositoryView products={products} onUpdate={fetchData} fetchWithAuth={fetchWithAuth} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden relative">
      {/* Mobile Menu Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform"
      >
        {isSidebarOpen ? <Plus className="rotate-45" size={24} /> : <LayoutDashboard size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-zinc-200 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="p-6 border-b border-zinc-100">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <TrendingUp size={18} />
            </div>
            BizManager
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<ShoppingCart size={20} />} 
            label="Sales" 
            active={activeTab === 'sales'} 
            onClick={() => { setActiveTab('sales'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Truck size={20} />} 
            label="Purchases" 
            active={activeTab === 'purchases'} 
            onClick={() => { setActiveTab('purchases'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Package size={20} />} 
            label="Inventory" 
            active={activeTab === 'inventory'} 
            onClick={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<CreditCard size={20} />} 
            label="Event POS" 
            active={activeTab === 'event-pos'} 
            onClick={() => { setActiveTab('event-pos'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Users size={20} />} 
            label="Vendors" 
            active={activeTab === 'vendors'} 
            onClick={() => { setActiveTab('vendors'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Filter size={20} />} 
            label="Product Repository" 
            active={activeTab === 'repository'} 
            onClick={() => { setActiveTab('repository'); setIsSidebarOpen(false); }} 
          />
        </nav>
        <div className="p-4 border-t border-zinc-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors mb-4"
          >
            <LogOut size={18} />
            Logout
          </button>
          <div className="flex items-center gap-3 p-2 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-medium text-xs">
              TC
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate">Tapas Chawla</p>
              <p className="text-xs text-zinc-500 truncate">Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
        active 
          ? "bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm" 
          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Views ---

function DashboardView({ data, onExport }: { data: DashboardData | null, onExport: () => void }) {
  if (!data) return <div>Loading...</div>;

  const profit = data.revenue - data.cost;
  const profitPercentage = data.cost > 0 ? (profit / data.cost) * 100 : 0;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedMonthlyData = data.monthlyData.map(d => ({
    ...d,
    name: monthNames[d.month - 1]
  }));

  const totalCashAvailable = data.revenue - data.cost;

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-zinc-900">Dashboard Overview</h2>
        <div className="flex items-center gap-2 lg:gap-4 overflow-x-auto pb-2 lg:pb-0">
          <button 
            onClick={onExport}
            className="flex items-center gap-2 text-sm text-zinc-600 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
          >
            <Download size={14} />
            Backup Database
          </button>
          <div className="flex items-center gap-2 text-sm text-zinc-500 bg-white px-3 py-1.5 rounded-lg border border-zinc-200">
            <Filter size={14} />
            Yearly Performance
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <StatCard 
          label="Inventory Value" 
          value={`₹${data.inventoryValue.toLocaleString()}`} 
          trend="Stock" 
          isPositive={true}
          icon={<Package className="text-zinc-600" size={20} />}
        />
        <StatCard 
          label="Total Revenue" 
          value={`₹${data.revenue.toLocaleString()}`} 
          trend="+12.5%" 
          isPositive={true}
          icon={<IndianRupee className="text-emerald-600" size={20} />}
        />
        <StatCard 
          label="Total Cash Available" 
          value={`₹${totalCashAvailable.toLocaleString()}`} 
          trend="Live" 
          isPositive={totalCashAvailable >= 0}
          icon={<CreditCard className="text-blue-600" size={20} />}
        />
        <StatCard 
          label="Net Profit" 
          value={`₹${profit.toLocaleString()}`} 
          trend={`${profitPercentage.toFixed(1)}%`} 
          isPositive={profit >= 0}
          icon={<TrendingUp className={profit >= 0 ? "text-emerald-600" : "text-rose-600"} size={20} />}
        />
        <StatCard 
          label="Total Sales" 
          value={data.totalUniqueSales.toString()} 
          trend="+5.4%" 
          isPositive={true}
          icon={<ShoppingCart className="text-amber-600" size={20} />}
        />
      </div>

      {/* Monthly Performance Chart */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-6">Monthly Performance</h3>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedMonthlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-zinc-600">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs font-medium text-zinc-600">Cost</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-zinc-600">Profit</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales by Category */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Sales by Category</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.salesByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.salesByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {data.salesByCategory.map((item, idx) => (
              <div key={item.category} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span className="text-xs text-zinc-600 truncate">{item.category}</span>
                <span className="text-xs font-semibold ml-auto">₹{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Top Performing Products</h3>
          <div className="space-y-4">
            {data.topProducts.map((product, idx) => (
              <div key={product.name} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium text-zinc-900">{product.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-900">{product.sales_count} Sold</p>
                  <p className="text-xs text-zinc-500">Units</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <h3 className="text-lg font-semibold mb-6">Cash Flow (Payment Methods)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.cashFlow}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="payment_method" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="total" fill="#10b981" radius={[8, 8, 0, 0]} barSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, isPositive, icon }: { label: string, value: string, trend: string, isPositive: boolean, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
          {icon}
        </div>
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold",
          isPositive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        )}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <p className="text-sm text-zinc-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-2xl border border-zinc-200 shadow-xl w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg">
            <Lock size={24} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Admin Login</h1>
          <p className="text-zinc-500 text-sm text-center mt-2">Enter your password to access BizManager Pro</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(password); }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase">Password</label>
            <input 
              type="password" 
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-[0.98]">
            Access Dashboard
          </button>
        </form>
        <p className="text-center text-[10px] text-zinc-400 mt-8 uppercase tracking-widest font-bold">
          Secure Personal Business Manager
        </p>
      </motion.div>
    </div>
  );
}

// --- Sales View ---
function SalesView({ sales, products, onUpdate, onExport, fetchWithAuth }: { sales: Sale[], products: Product[], onUpdate: () => void, onExport: () => void, fetchWithAuth: any }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [formData, setFormData] = useState({
    order_number: `ORD-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString().split('T')[0],
    product_id: '',
    quantity: 1,
    actual_price: 0,
    selling_price: 0,
    discount: 0,
    customer_name: '',
    customer_contact: '',
    customer_address: '',
    channel: 'B2C',
    payment_method: 'Online'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchWithAuth('/api/sales', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    setShowAdd(false);
    onUpdate();
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    await fetchWithAuth(`/api/sales/${editingSale.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        customer_name: editingSale.customer_name,
        selling_price: editingSale.selling_price,
        customer_contact: editingSale.customer_contact,
        customer_address: editingSale.customer_address,
        discount: editingSale.discount
      })
    });
    setEditingSale(null);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Sales Records</h2>
          <p className="text-zinc-500 text-sm">Track all your customer orders and revenue</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onExport}
            className="flex items-center gap-2 bg-white text-zinc-600 border border-zinc-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            New Sale
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add New Sale</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Order Number</label>
                <input 
                  type="text" 
                  value={formData.order_number} 
                  disabled
                  className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Date</label>
                <input 
                  type="date" 
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Product</label>
                <select 
                  required
                  value={formData.product_id}
                  onChange={e => setFormData({...formData, product_id: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                >
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Quantity</label>
                <input 
                  type="number" 
                  required
                  min="1"
                  value={formData.quantity}
                  onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Selling Price</label>
                <input 
                  type="number" 
                  required
                  value={formData.selling_price}
                  onChange={e => setFormData({...formData, selling_price: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Customer Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.customer_name}
                  onChange={e => setFormData({...formData, customer_name: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Contact Details</label>
                <input 
                  type="text" 
                  value={formData.customer_contact}
                  onChange={e => setFormData({...formData, customer_contact: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Address</label>
                <textarea 
                  value={formData.customer_address}
                  onChange={e => setFormData({...formData, customer_address: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm resize-none"
                  rows={2}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Channel</label>
                <select 
                  value={formData.channel}
                  onChange={e => setFormData({...formData, channel: e.target.value as any})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                >
                  <option value="B2C">B2C</option>
                  <option value="B2B">B2B</option>
                  <option value="B2B2C">B2B2C</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Payment Method</label>
                <select 
                  value={formData.payment_method}
                  onChange={e => setFormData({...formData, payment_method: e.target.value as any})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                >
                  <option value="Online">Online</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div className="col-span-2 pt-4">
                <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors">
                  Save Sale
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {editingSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Sale: {editingSale.order_number}</h3>
              <button onClick={() => setEditingSale(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Customer Name</label>
                <input 
                  type="text" 
                  required
                  value={editingSale.customer_name}
                  onChange={e => setEditingSale({...editingSale, customer_name: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Selling Price (Per Unit)</label>
                <input 
                  type="number" 
                  required
                  value={editingSale.selling_price}
                  onChange={e => setEditingSale({...editingSale, selling_price: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Contact Details</label>
                <input 
                  type="text" 
                  value={editingSale.customer_contact || ''}
                  onChange={e => setEditingSale({...editingSale, customer_contact: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Address</label>
                <textarea 
                  value={editingSale.customer_address || ''}
                  onChange={e => setEditingSale({...editingSale, customer_address: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm resize-none"
                  rows={2}
                />
              </div>
              <div className="col-span-2 pt-4">
                <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors">
                  Update Sale
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Order #</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Product</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-center">Qty</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-right">Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-center">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sales.map(sale => (
                <tr key={sale.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-zinc-900">{sale.order_number}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">{sale.date}</td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900">{sale.product_name}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">
                    <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      {sale.category || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-600 text-center font-medium">{sale.quantity}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">
                    <div>{sale.customer_name}</div>
                    {sale.customer_contact && <div className="text-[10px] text-zinc-400">{sale.customer_contact}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-900 text-right">₹{(sale.selling_price * sale.quantity).toLocaleString()}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      Completed
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setEditingSale(sale)}
                      className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Purchases View ---
function PurchasesView({ purchases, vendors, products, onUpdate, onExport, fetchWithAuth }: { purchases: Purchase[], vendors: Vendor[], products: Product[], onUpdate: () => void, onExport: () => void, fetchWithAuth: any }) {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    purchase_number: `PUR-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString().split('T')[0],
    vendor_id: '',
    product_id: '',
    cost: 0,
    quantity: 1,
    payment_method: 'Online'
  });

  const selectedProduct = products.find(p => p.id === parseInt(formData.product_id));
  const netPrice = formData.cost * formData.quantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchWithAuth('/api/purchases', {
      method: 'POST',
      body: JSON.stringify({
        ...formData,
        category: selectedProduct?.category || '',
        net_price: netPrice
      })
    });
    setShowAdd(false);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Purchase Orders</h2>
          <p className="text-zinc-500 text-sm">Manage your inventory procurement and vendor costs</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onExport}
            className="flex items-center gap-2 bg-white text-zinc-600 border border-zinc-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            New Purchase
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add New Purchase</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Purchase #</label>
                <input type="text" value={formData.purchase_number} disabled className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Date</label>
                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Vendor</label>
                <select required value={formData.vendor_id} onChange={e => setFormData({...formData, vendor_id: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm">
                  <option value="">Select Vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Product</label>
                <select required value={formData.product_id} onChange={e => setFormData({...formData, product_id: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm">
                  <option value="">Select Product</option>
                  {products.filter(p => !p.is_bundle).map(p => <option key={p.id} value={p.id}>{p.name} ({p.variant})</option>)}
                </select>
              </div>
              {selectedProduct && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center col-span-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Category</span>
                  <span className="text-sm font-bold text-zinc-900">{selectedProduct.category}</span>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Quantity</label>
                <input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Unit Cost</label>
                <input type="number" value={formData.cost} onChange={e => setFormData({...formData, cost: parseFloat(e.target.value)})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Payment Method</label>
                <select 
                  value={formData.payment_method}
                  onChange={e => setFormData({...formData, payment_method: e.target.value as any})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                >
                  <option value="Online">Online</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex justify-between items-center col-span-2">
                <span className="text-xs font-bold text-blue-600 uppercase">Net Cost</span>
                <span className="text-lg font-bold text-blue-700">₹{netPrice.toLocaleString()}</span>
              </div>
              <div className="col-span-2 pt-4">
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
                  Save Purchase
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Purchase #</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Vendor</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Product</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-right">Net Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {purchases.map(p => (
                <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-zinc-900">{p.purchase_number}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">{p.date}</td>
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900">{p.vendor_name}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">{p.product_name}</td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-900 text-right">₹{p.net_price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Inventory View ---
function InventoryView({ inventory, products, onUpdate, onExport, fetchWithAuth }: { inventory: InventoryItem[], products: Product[], onUpdate: () => void, onExport: () => void, fetchWithAuth: any }) {
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    variant: '',
    quantity: 0,
    unit_cost: 0
  });

  const uniqueProductNames = Array.from(new Set(products.map(p => p.name)));
  const availableVariants = products.filter(p => p.name === formData.name).map(p => p.variant);
  const selectedProduct = products.find(p => p.name === formData.name && p.variant === formData.variant);
  const totalCost = formData.quantity * formData.unit_cost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return alert('Please select a valid product and variant');
    
    // In this new workflow, we update existing inventory or initialize it
    // The user said "mention the cost of the inventory as per the quantity"
    // We'll treat this as a manual stock adjustment/initialization
    await fetchWithAuth('/api/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify({ 
        product_id: selectedProduct.id, 
        quantity: formData.quantity,
        cost: formData.unit_cost 
      })
    });
    setShowAddProduct(false);
    setFormData({ name: '', variant: '', quantity: 0, unit_cost: 0 });
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Inventory Status</h2>
          <p className="text-zinc-500 text-sm">Real-time stock levels and product management</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onExport}
            className="flex items-center gap-2 bg-white text-zinc-600 border border-zinc-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => setShowAddProduct(true)}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Add Stock
          </button>
        </div>
      </div>

      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add Stock to Inventory</h3>
              <button onClick={() => setShowAddProduct(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Product Name</label>
                <select 
                  required 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value, variant: ''})} 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                >
                  <option value="">Select Product</option>
                  {uniqueProductNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Variant</label>
                <select 
                  required 
                  value={formData.variant} 
                  onChange={e => setFormData({...formData, variant: e.target.value})} 
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                  disabled={!formData.name}
                >
                  <option value="">Select Variant</option>
                  {availableVariants.map(v => <option key={v} value={v}>{v || 'No Variant'}</option>)}
                </select>
              </div>
              {selectedProduct && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Category</span>
                  <span className="text-sm font-bold text-zinc-900">{selectedProduct.category}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Quantity</label>
                  <input type="number" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Unit Cost</label>
                  <input type="number" required value={formData.unit_cost} onChange={e => setFormData({...formData, unit_cost: parseFloat(e.target.value)})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
                </div>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-600 uppercase">Total Inventory Cost</span>
                <span className="text-lg font-bold text-emerald-700">₹{totalCost.toLocaleString()}</span>
              </div>
              <button type="submit" className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors">
                Add to Inventory
              </button>
            </form>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {inventory.map(item => (
          <div key={item.product_id} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-2 inline-block">
                  {item.category}
                </span>
                <h3 className="text-lg font-bold text-zinc-900">{item.name}</h3>
                <p className="text-xs text-zinc-500">{item.subcategory}</p>
              </div>
              <div className={cn(
                "w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold",
                item.quantity > 10 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              )}>
                <span className="text-lg leading-none">{item.quantity}</span>
                <span className="text-[8px] uppercase">Left</span>
              </div>
            </div>
            <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden mb-4">
              <div 
                className={cn("h-full transition-all duration-500", item.quantity > 10 ? "bg-emerald-500" : "bg-rose-500")}
                style={{ width: `${Math.min(100, (item.quantity / 50) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-zinc-50">
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-zinc-400 uppercase">Avg Unit Cost</p>
                <p className="text-sm font-bold text-zinc-900">₹{item.unit_cost?.toLocaleString() || '0'}</p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-[10px] font-bold text-zinc-400 uppercase">Total Value</p>
                <p className="text-sm font-bold text-emerald-600">₹{(item.quantity * item.unit_cost).toLocaleString()}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Vendors View ---
function VendorsView({ vendors, purchases, onUpdate, onExport, fetchWithAuth }: { vendors: Vendor[], purchases: Purchase[], onUpdate: () => void, onExport: () => void, fetchWithAuth: any }) {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({ name: '', contact: '', category: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchWithAuth('/api/vendors', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    setShowAdd(false);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Vendor Directory</h2>
          <p className="text-zinc-500 text-sm">Manage your suppliers and their order history</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onExport}
            className="flex items-center gap-2 bg-white text-zinc-600 border border-zinc-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <Download size={18} />
            Export CSV
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <Plus size={18} />
            New Vendor
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add New Vendor</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Vendor Name</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Contact Info</label>
                <input type="text" required value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Category</label>
                <input type="text" required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <button type="submit" className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors">
                Save Vendor
              </button>
            </form>
          </motion.div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {vendors.map(vendor => {
          const vendorPurchases = purchases.filter(p => p.vendor_id === vendor.id);
          const totalSpent = vendorPurchases.reduce((acc, curr) => acc + curr.net_price, 0);
          
          return (
            <div key={vendor.id} className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-100">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">{vendor.name}</h3>
                    <p className="text-sm text-zinc-500">{vendor.contact}</p>
                    <span className="mt-2 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-block">
                      {vendor.category}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-500 uppercase font-bold">Total Spent</p>
                    <p className="text-xl font-bold text-zinc-900">₹{totalSpent.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-zinc-50">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Recent Orders</p>
                <div className="space-y-2">
                  {vendorPurchases.slice(-3).map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-600">{p.date}</span>
                      <span className="font-medium text-zinc-900">{p.product_name}</span>
                      <span className="font-bold text-zinc-900">₹{p.net_price.toLocaleString()}</span>
                    </div>
                  ))}
                  {vendorPurchases.length === 0 && <p className="text-xs text-zinc-400 italic">No orders yet</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductRepositoryView({ products, onUpdate, fetchWithAuth }: { products: Product[], onUpdate: () => void, fetchWithAuth: any }) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    variant: '',
    mrp: 0
  });
  
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetchWithAuth('/api/products', {
        method: 'POST',
        body: JSON.stringify({ ...formData, base_price: 0, initial_quantity: 0 })
      });
      if (!response.ok) {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to save product'}`);
        return;
      }
      setShowAdd(false);
      setFormData({ name: '', category: '', variant: '', mrp: 0 });
      await onUpdate();
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product. Please check your connection.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Product Repository</h2>
          <p className="text-zinc-500 text-sm">Master list of all products and their category mappings</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button 
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Add Product
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add New Product to Repository</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Product Name</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Category</label>
                <input type="text" required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Variant</label>
                <input type="text" value={formData.variant} onChange={e => setFormData({...formData, variant: e.target.value})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" placeholder="e.g. XL, Blue, 500ml" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">MRP</label>
                <input type="number" required value={formData.mrp} onChange={e => setFormData({...formData, mrp: parseFloat(e.target.value)})} className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm" />
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors">
                Save to Repository
              </button>
            </form>
          </motion.div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Product Name</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Variant</th>
                <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-right">MRP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-zinc-900">{p.name}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600">
                    <span className="px-2 py-1 bg-zinc-100 rounded-lg text-[10px] font-bold uppercase">
                      {p.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-600">{p.variant || '-'}</td>
                  <td className="px-6 py-4 text-sm font-bold text-zinc-900 text-right">₹{p.mrp?.toLocaleString() || '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EventPOSView({ products, onUpdate, fetchWithAuth }: { products: Product[], onUpdate: () => void, fetchWithAuth: any }) {
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'dashboard'>('pos');
  const [events, setEvents] = useState<Event[]>([]);
  const [eventName, setEventName] = useState('');
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [eventStats, setEventStats] = useState<any>(null);
  const [eventSales, setEventSales] = useState<EventSale[]>([]);
  const [formData, setFormData] = useState({
    order_number: `EVT-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString().split('T')[0],
    product_id: '',
    serial_number: '',
    selling_price: 0,
    customer_name: '',
    customer_contact: '',
    customer_address: '',
    payment_method: 'Online' as 'Online' | 'Cash'
  });

  const fetchEvents = async () => {
    try {
      const res = await fetchWithAuth('/api/events');
      const data = await res.json();
      setEvents(data);
      if (data.length > 0 && !eventName) {
        setEventName(data[0].name);
      }
    } catch (e) {
      console.error('Error fetching events:', e);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;
    try {
      const res = await fetchWithAuth('/api/events', {
        method: 'POST',
        body: JSON.stringify({ name: newEventName.trim() })
      });
      if (res.ok) {
        setEventName(newEventName.trim());
        setNewEventName('');
        setIsAddingEvent(false);
        fetchEvents();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create event');
      }
    } catch (e) {
      console.error('Error creating event:', e);
    }
  };

  const selectedProduct = products.find(p => p.id === parseInt(formData.product_id));
  const discount = selectedProduct && selectedProduct.mrp > 0 
    ? ((selectedProduct.mrp - formData.selling_price) / selectedProduct.mrp) * 100 
    : 0;

  const fetchEventStats = async () => {
    if (!eventName) return;
    try {
      const res = await fetchWithAuth(`/api/events/${eventName}/dashboard`);
      const data = await res.json();
      setEventStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEventSales = async () => {
    if (!eventName) return;
    try {
      const res = await fetchWithAuth(`/api/event-sales?event_name=${eventName}&pushed=false`);
      const data = await res.json();
      setEventSales(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (eventName) {
      fetchEventSales();
      if (activeSubTab === 'dashboard') fetchEventStats();
    }
  }, [eventName, activeSubTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName) return alert('Please select or enter an event name');
    await fetchWithAuth('/api/event-sales', {
      method: 'POST',
      body: JSON.stringify({ ...formData, event_name: eventName, quantity: 1 })
    });
    setFormData({
      ...formData,
      order_number: `EVT-${Date.now().toString().slice(-6)}`,
      serial_number: '',
      selling_price: 0,
      customer_name: '',
      customer_contact: '',
      customer_address: ''
    });
    fetchEventSales();
    onUpdate();
    if (activeSubTab === 'dashboard') fetchEventStats();
  };

  const handlePushToMain = async () => {
    if (!eventName) return;
    if (!confirm(`Are you sure you want to push all unpushed sales for "${eventName}" to the main sales record? This will consolidate them into two entries (Cash & Online).`)) return;
    
    try {
      const res = await fetchWithAuth(`/api/events/${eventName}/push-to-main`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('Sales pushed successfully!');
        fetchEventSales();
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to push sales');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to push sales');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Event Point of Sale</h2>
          <p className="text-zinc-500 text-sm">Manage on-site sales for specific events</p>
        </div>
        <div className="flex bg-zinc-100 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveSubTab('pos')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", activeSubTab === 'pos' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}
          >
            POS Terminal
          </button>
          <button 
            onClick={() => setActiveSubTab('dashboard')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", activeSubTab === 'dashboard' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700")}
          >
            Event Stats
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="max-w-md mb-8">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Current Event</label>
            <button 
              onClick={() => setIsAddingEvent(!isAddingEvent)}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              {isAddingEvent ? 'Cancel' : <><Plus size={12} /> New Event</>}
            </button>
          </div>
          
          {isAddingEvent ? (
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Enter new event name..." 
                value={newEventName}
                onChange={e => setNewEventName(e.target.value)}
                className="flex-1 px-4 py-3 border border-zinc-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button 
                onClick={handleCreateEvent}
                className="bg-emerald-600 text-white px-6 rounded-xl font-bold hover:bg-emerald-700 transition-all"
              >
                Add
              </button>
            </div>
          ) : (
            <select 
              value={eventName}
              onChange={e => setEventName(e.target.value)}
              className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none appearance-none bg-white"
            >
              <option value="">Select an event</option>
              {events.map(e => (
                <option key={e.id} value={e.name}>{e.name}</option>
              ))}
            </select>
          )}
        </div>

        {activeSubTab === 'pos' ? (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Product</label>
                <select 
                  required 
                  value={formData.product_id} 
                  onChange={e => setFormData({...formData, product_id: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                >
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.variant})</option>)}
                </select>
              </div>
              {selectedProduct && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-400 uppercase">Category</span>
                  <span className="text-sm font-bold text-zinc-900">{selectedProduct.category}</span>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Serial Number (Manual)</label>
                <input 
                  type="text" 
                  value={formData.serial_number} 
                  onChange={e => setFormData({...formData, serial_number: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                  placeholder="Enter S/N"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Customer Name</label>
                <input 
                  type="text" 
                  value={formData.customer_name} 
                  onChange={e => setFormData({...formData, customer_name: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Contact Details</label>
                <input 
                  type="text" 
                  value={formData.customer_contact} 
                  onChange={e => setFormData({...formData, customer_contact: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm"
                  placeholder="Phone or Email (Optional)"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Address</label>
                <textarea 
                  value={formData.customer_address} 
                  onChange={e => setFormData({...formData, customer_address: e.target.value})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm resize-none"
                  rows={2}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Selling Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">₹</span>
                  <input 
                    type="number" 
                    required 
                    value={formData.selling_price} 
                    onChange={e => setFormData({...formData, selling_price: parseFloat(e.target.value)})}
                    className="w-full pl-8 pr-4 py-2 border border-zinc-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>
              {selectedProduct && (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-600 font-bold uppercase">MRP</span>
                    <span className="text-zinc-900 font-bold">₹{selectedProduct.mrp}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-600 font-bold uppercase">Discount</span>
                    <span className="text-emerald-700 font-bold">{discount.toFixed(1)}%</span>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, payment_method: 'Online'})}
                    className={cn("py-2 rounded-xl text-sm font-bold border transition-all", formData.payment_method === 'Online' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-zinc-600 border-zinc-200")}
                  >
                    Online
                  </button>
                  <button 
                    type="button"
                    onClick={() => setFormData({...formData, payment_method: 'Cash'})}
                    className={cn("py-2 rounded-xl text-sm font-bold border transition-all", formData.payment_method === 'Cash' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-zinc-600 border-zinc-200")}
                  >
                    Cash
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-lg active:scale-[0.98] mt-4">
                Complete Sale
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-8">
            {!eventStats ? (
              <div className="text-center py-12 text-zinc-500">Enter an event name to see statistics</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Total Sales</p>
                    <p className="text-2xl font-bold text-zinc-900">₹{eventStats.totalSales.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Cash Collection</p>
                    <p className="text-2xl font-bold text-emerald-600">₹{eventStats.cashFlow.find((c: any) => c.payment_method === 'Cash')?.total.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Online Collection</p>
                    <p className="text-2xl font-bold text-blue-600">₹{eventStats.cashFlow.find((c: any) => c.payment_method === 'Online')?.total.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Best Seller</p>
                    <p className="text-lg font-bold text-zinc-900 truncate">{eventStats.bestSellingProduct?.name || 'N/A'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
                    <h4 className="text-sm font-bold text-zinc-900 mb-6 uppercase">Category Distribution</h4>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={eventStats.categoryDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {eventStats.categoryDistribution.map((_: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {eventStats.categoryDistribution.map((item: any, idx: number) => (
                        <div key={item.category} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-[10px] text-zinc-600 truncate">{item.category}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-zinc-100 shadow-sm">
                    <h4 className="text-sm font-bold text-zinc-900 mb-6 uppercase">Top Products</h4>
                    <div className="space-y-3">
                      {eventStats.topProducts.map((p: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
                          <span className="text-sm font-medium text-zinc-900">{p.name}</span>
                          <span className="text-sm font-bold text-zinc-900">{p.sales_count} Sold</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {activeSubTab === 'pos' && eventName && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Unpushed Sales for {eventName}</h3>
              <p className="text-sm text-zinc-500">Individual sales recorded but not yet consolidated to main records</p>
            </div>
            <button 
              onClick={handlePushToMain}
              disabled={eventSales.length === 0}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp size={18} />
              Push to Main Records
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Product</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-right">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase text-center">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {eventSales.map(sale => (
                  <tr key={sale.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-zinc-600">{sale.date}</td>
                    <td className="px-6 py-4 text-sm font-medium text-zinc-900">{sale.product_name}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      <div>{sale.customer_name || 'Walk-in'}</div>
                      {sale.customer_contact && <div className="text-[10px] text-zinc-400">{sale.customer_contact}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-zinc-900 text-right">₹{(sale.selling_price * sale.quantity).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                        sale.payment_method === 'Online' ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                      )}>
                        {sale.payment_method}
                      </span>
                    </td>
                  </tr>
                ))}
                {eventSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 italic">
                      No unpushed sales for this event
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
