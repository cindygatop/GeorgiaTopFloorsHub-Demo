(function () {
  const STORE_KEY = "gtfProjectDocumentsV1";

  const defaultProjects = {
    "emily-carter": {
      project: {
        id: 2,
        customer: "Emily Carter",
        company: "Direct Homeowner",
        address: "410 Lakeview Ln, Roswell, GA",
        service: "Sand & Finish",
        area: "980 SF",
        manager: "Isaque",
        crew: "Edson + team",
        arrival: "8:00–9:00 AM",
        startDate: "Sep 21, 2026",
        stain: "Provincial — pending final selection",
        finish: "Water-based"
      },
      visibility: {
        customerEstimate: true,
        customerInvoice: true,
        crewWorkOrder: true
      },
      estimate: {
        number: "EST-1042",
        status: "Approved",
        issued: "Sep 18, 2026",
        validUntil: "Oct 18, 2026",
        items: [
          { description: "Sand & Finish — demo scope", qty: "980 SF", amount: 3920 },
          { description: "Water-based finish upgrade — demo", qty: "980 SF", amount: 490 },
          { description: "Furniture handling — demo", qty: "Project", amount: 350 }
        ],
        subtotal: 4760,
        total: 4760,
        notes: "Demo pricing only. Stain samples are selected onsite before final staining."
      },
      invoice: {
        number: "INV-1042",
        status: "Partially Paid",
        issued: "Sep 18, 2026",
        dueDate: "Sep 21, 2026",
        total: 4760,
        paid: 3332,
        balance: 1428,
        paymentRule: "70% initial payment / 30% final balance",
        notes: "Demo invoice. Production payment would open through a secure payment provider."
      },
      workOrder: {
        number: "WO-1042",
        status: "Ready",
        service: "Sand & Finish",
        area: "980 SF",
        arrival: "8:00–9:00 AM",
        manager: "Isaque",
        crew: "Edson + team",
        stain: "Provincial — pending final selection",
        finish: "Water-based",
        scope: [
          "Protect work areas and prepare the floor",
          "Sand existing hardwood flooring",
          "Apply stain samples onsite and confirm customer selection",
          "Apply selected stain",
          "Apply water-based finish coats",
          "Complete final inspection and cleanup"
        ],
        materials: [
          "Sanding supplies",
          "Stain samples",
          "Selected stain",
          "Water-based finish"
        ],
        notes: "Furniture handling is included in this demo scope. Confirm stain choice before staining begins."
      }
    }
  };

  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function loadAll() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && typeof saved === "object") {
        return Object.assign(deepClone(defaultProjects), saved);
      }
    } catch (_) {}
    return deepClone(defaultProjects);
  }

  function saveAll(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  function money(value) {
    return Number(value || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });
  }

  function keyForJob(job) {
    const name = String(job?.customer || "demo-project")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return name || "demo-project";
  }

  function ensureForJob(job) {
    const data = loadAll();
    const key = keyForJob(job);
    if (!data[key]) {
      const isDirect = job.company === "Direct Homeowner";
      data[key] = {
        project: {
          id: job.id,
          customer: job.customer,
          company: job.company,
          address: job.address,
          service: job.service,
          area: job.sf,
          manager: job.manager,
          crew: job.crew,
          arrival: job.window,
          startDate: job.date,
          stain: job.stain,
          finish: "To confirm"
        },
        visibility: {
          customerEstimate: isDirect,
          customerInvoice: isDirect,
          crewWorkOrder: true
        },
        estimate: {
          number: `EST-${String(job.id).slice(-4)}`,
          status: "Draft",
          issued: "Demo",
          validUntil: "Demo",
          items: [{ description: `${job.service} — demo scope`, qty: job.sf || "Project", amount: 0 }],
          subtotal: 0,
          total: 0,
          notes: "Draft demo document. Pricing has not been entered."
        },
        invoice: {
          number: `INV-${String(job.id).slice(-4)}`,
          status: "Not Issued",
          issued: "—",
          dueDate: job.date || "—",
          total: 0,
          paid: 0,
          balance: 0,
          paymentRule: "To confirm",
          notes: "Invoice will be created after estimate approval."
        },
        workOrder: {
          number: `WO-${String(job.id).slice(-4)}`,
          status: "Draft",
          service: job.service,
          area: job.sf,
          arrival: job.window,
          manager: job.manager,
          crew: job.crew,
          stain: job.stain,
          finish: "To confirm",
          scope: [job.service],
          materials: [job.materials || "To confirm"],
          notes: job.notes || ""
        }
      };
      saveAll(data);
    }
    return { key, docs: data[key] };
  }

  function get(key = "emily-carter") {
    const data = loadAll();
    return data[key] || null;
  }

  function update(key, updater) {
    const data = loadAll();
    if (!data[key]) return null;
    updater(data[key]);
    saveAll(data);
    return data[key];
  }

  function approveEstimate(key) {
    return update(key, d => {
      d.estimate.status = "Approved";
      if (d.invoice.status === "Not Issued") d.invoice.status = "Open";
    });
  }

  function recordFinalPayment(key) {
    return update(key, d => {
      d.invoice.paid = d.invoice.total;
      d.invoice.balance = 0;
      d.invoice.status = "Paid";
    });
  }

  function releaseWorkOrder(key) {
    return update(key, d => {
      d.workOrder.status = "Released";
    });
  }

  function resetDemo() {
    localStorage.removeItem(STORE_KEY);
    return loadAll();
  }

  window.GTFDocs = {
    STORE_KEY,
    money,
    get,
    keyForJob,
    ensureForJob,
    approveEstimate,
    recordFinalPayment,
    releaseWorkOrder,
    resetDemo
  };
})();