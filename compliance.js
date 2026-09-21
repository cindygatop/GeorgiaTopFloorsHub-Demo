(function(){
  const STORE_KEY='gtfComplianceCenterV1';
  const TODAY='2026-09-21';

  const defaults={
    records:[
      {id:'cmp-annual',category:'Company & Insurance',entityType:'Company',entity:'Georgia Top Floors',documentType:'Georgia Annual Registration',level:'Required',status:'Current',effectiveDate:'2026-01-10',expirationDate:'2027-04-01',linkedTo:'Company',notes:'Georgia business annual registration tracking.'},
      {id:'cmp-gl',category:'Company & Insurance',entityType:'Company',entity:'Georgia Top Floors',documentType:'General Liability Insurance / COI',level:'Required if licensed / contractually required',status:'Current',effectiveDate:'2026-03-31',expirationDate:'2027-03-31',linkedTo:'Company',notes:'Track carrier, policy number, limits and certificate.'},
      {id:'cmp-wc',category:'Company & Insurance',entityType:'Company',entity:'Georgia Top Floors',documentType:"Workers' Compensation Insurance",level:'Required when applicable',status:'Current',effectiveDate:'2025-10-12',expirationDate:'2026-10-12',linkedTo:'Company',notes:'Georgia generally requires coverage when regularly employing 3 or more people.'},
      {id:'cmp-local',category:'Company & Insurance',entityType:'Company',entity:'Georgia Top Floors',documentType:'Local Business / Occupational Tax Certificate',level:'Local / if applicable',status:'Current',effectiveDate:'2026-01-01',expirationDate:'2026-12-31',linkedTo:'Company',notes:'Track city/county business licensing or occupational tax certificate where applicable.'},

      {id:'sub-lucas-w9',category:'People & Subcontractors',entityType:'Subcontractor',entity:'Lucas Ferreira / LF Floors',documentType:'Form W-9',level:'Required for tax reporting when applicable',status:'Current',effectiveDate:'2026-01-15',expirationDate:'',linkedTo:'Subcontractor #301',notes:'Taxpayer identification record. No routine expiration date.'},
      {id:'sub-lucas-coi',category:'People & Subcontractors',entityType:'Subcontractor',entity:'Lucas Ferreira / LF Floors',documentType:'Certificate of Insurance — General Liability',level:'Company requirement / risk control',status:'Current',effectiveDate:'2025-10-04',expirationDate:'2026-10-04',linkedTo:'Subcontractor #301',notes:'Renewed certificate should be collected before expiration.'},
      {id:'sub-marcos-coi',category:'People & Subcontractors',entityType:'Subcontractor',entity:'Marcos Silva / MS Finish',documentType:'Certificate of Insurance — General Liability',level:'Company requirement / risk control',status:'Current',effectiveDate:'2025-09-10',expirationDate:'2026-09-10',linkedTo:'Subcontractor #302',notes:'Expired in demo — requires review before new assignment.'},
      {id:'sub-marcos-wc',category:'People & Subcontractors',entityType:'Subcontractor',entity:'Marcos Silva / MS Finish',documentType:"Workers' Compensation COI / Evidence",level:'If applicable',status:'Current',effectiveDate:'2026-02-02',expirationDate:'2027-02-02',linkedTo:'Subcontractor #302',notes:'Track coverage or applicable exemption/evidence according to company process.'},
      {id:'emp-i9',category:'People & Subcontractors',entityType:'Employee',entity:'Employee File — Demo',documentType:'Form I-9',level:'Required for employees',status:'Current',effectiveDate:'2026-01-05',expirationDate:'',linkedTo:'Restricted Employee File',notes:'Sensitive employment eligibility record. Production access should be restricted.'},

      {id:'agr-sub-lucas',category:'Contracts & Agreements',entityType:'Subcontractor',entity:'Lucas Ferreira / LF Floors',documentType:'Master Subcontractor Agreement',level:'Company requirement',status:'Current',effectiveDate:'2026-01-15',expirationDate:'2027-01-15',linkedTo:'Subcontractor #301',notes:'Signed subcontract terms and responsibilities.'},
      {id:'agr-alpha',category:'Contracts & Agreements',entityType:'Partner',entity:'Alpha',documentType:'Contractor / Partner Agreement',level:'Company requirement',status:'Current',effectiveDate:'2026-02-01',expirationDate:'2027-02-01',linkedTo:'Partner Account',notes:'Master relationship terms.'},
      {id:'agr-terms',category:'Contracts & Agreements',entityType:'Company',entity:'Georgia Top Floors',documentType:'Customer Terms & Conditions Template',level:'Company template',status:'Review Needed',effectiveDate:'2026-01-01',expirationDate:'',reviewDate:'2026-10-01',linkedTo:'Template Library',notes:'Periodic review of customer-facing terms and warranty language.'},

      {id:'job-emily-consent',category:'Job Compliance',entityType:'Job',entity:'Emily Carter',documentType:'Customer Agreement / Consent & Acknowledgment',level:'Company-required job signature',status:'Signed',effectiveDate:'2026-09-18',expirationDate:'',signedDate:'2026-09-18',jobId:2,linkedTo:'410 Lakeview Ln, Roswell, GA',notes:'Source of truth is the Job. Compliance Center monitors whether the signature is on file.'},
      {id:'job-michael-consent',category:'Job Compliance',entityType:'Job',entity:'Michael Reed',documentType:'Customer Agreement / Consent & Acknowledgment',level:'Company-required job signature',status:'Signed',effectiveDate:'2026-09-20',expirationDate:'',signedDate:'2026-09-20',jobId:3,linkedTo:'118 Peachtree Ct, Marietta, GA',notes:'Signed job-specific acknowledgment.'},
      {id:'job-sarah-consent',category:'Job Compliance',entityType:'Job',entity:'Sarah Johnson',documentType:'Customer Agreement / Consent & Acknowledgment',level:'Company-required job signature',status:'Missing',effectiveDate:'',expirationDate:'',signedDate:'',jobId:4,linkedTo:'772 Brookstone Dr, Cumming, GA',notes:'Signature missing in demo. Should be completed before work begins if required by company policy.'},
      {id:'job-robert-change',category:'Job Compliance',entityType:'Job',entity:'Robert Hayes',documentType:'Change Order / Additional Work Authorization',level:'Project-specific',status:'Signature Needed',effectiveDate:'',expirationDate:'',signedDate:'',jobId:5,linkedTo:'9330 River Club Pkwy, Johns Creek, GA',notes:'Demo issue requires manager review and signed authorization before additional paid scope.'},

      {id:'safety-rrp',category:'Safety & Certifications',entityType:'Company',entity:'Georgia Top Floors',documentType:'EPA RRP Firm Certification',level:'If covered work applies',status:'Review Needed',effectiveDate:'',expirationDate:'',reviewDate:'2026-09-30',linkedTo:'Company / applicable pre-1978 jobs',notes:'Track only if the company performs covered work disturbing paint in pre-1978 housing or child-occupied facilities.'},
      {id:'safety-sds',category:'Safety & Certifications',entityType:'Company',entity:'Georgia Top Floors',documentType:'Safety Data Sheets (SDS) / Hazard Communication File',level:'Required for hazardous chemicals used',status:'Current',effectiveDate:'2026-01-01',expirationDate:'',reviewDate:'2027-01-01',linkedTo:'Safety Library',notes:'Keep current SDS information accessible to workers where required.'},

      {id:'tax-salesuse',category:'Tax & Admin',entityType:'Company',entity:'Georgia Top Floors',documentType:'Georgia Sales & Use Tax Account / Contractor Registration',level:'Required for contractors',status:'Current',effectiveDate:'2026-01-01',expirationDate:'',linkedTo:'Tax File',notes:'Track account registration and related tax records.'},
      {id:'tax-ein',category:'Tax & Admin',entityType:'Company',entity:'Georgia Top Floors',documentType:'EIN Confirmation',level:'Core company record',status:'Current',effectiveDate:'',expirationDate:'',linkedTo:'Tax File',notes:'Permanent company tax identification record.'}
    ],
    library:[
      {category:'Company & Insurance',name:'Georgia Annual Registration',applies:'Georgia business entity',monitor:'Annual due date'},
      {category:'Company & Insurance',name:'Local Business / Occupational Tax Certificate',applies:'City/county requirements vary',monitor:'Renewal / expiration'},
      {category:'Company & Insurance',name:'Residential / General Contractor License or Qualifying Agent records',applies:'Only if the company/scope requires that license',monitor:'License status / renewal'},
      {category:'Company & Insurance',name:'General Liability Policy / COI',applies:'Licensure / contracts / risk management',monitor:'Policy expiration, limits, carrier'},
      {category:'Company & Insurance',name:"Workers' Compensation Policy / Evidence",applies:'When legally required or contractually required',monitor:'Policy expiration'},
      {category:'Company & Insurance',name:'Commercial Auto / Umbrella Insurance',applies:'If carried / required by contracts',monitor:'Policy expiration'},

      {category:'People & Subcontractors',name:'Form W-9',applies:'Subcontractors/vendors paid as reportable payees',monitor:'On file / updated when legal name or TIN changes'},
      {category:'People & Subcontractors',name:'Subcontractor COI — General Liability',applies:'Company risk-control requirement',monitor:'Expiration / coverage limits'},
      {category:'People & Subcontractors',name:"Workers' Comp COI / applicable evidence",applies:'Subcontractor risk/compliance review',monitor:'Expiration / applicability'},
      {category:'People & Subcontractors',name:'Trade License / Certification',applies:'When the trade or scope requires it',monitor:'Expiration'},
      {category:'People & Subcontractors',name:'Form I-9',applies:'Employees',monitor:'Completion / reverification when authorization expires'},
      {category:'People & Subcontractors',name:'Training / Safety Certifications',applies:'Role and task dependent',monitor:'Expiration / refresher date'},

      {category:'Contracts & Agreements',name:'Master Subcontractor Agreement',applies:'Subcontractor relationship',monitor:'Signed / review date'},
      {category:'Contracts & Agreements',name:'Builder / Contractor / Partner Agreement',applies:'Partner accounts',monitor:'Signed / expiration / review'},
      {category:'Contracts & Agreements',name:'Vendor Agreement',applies:'Where formal supplier terms are used',monitor:'Signed / renewal'},
      {category:'Contracts & Agreements',name:'Customer Terms & Conditions / Warranty Template',applies:'Company customer documents',monitor:'Version / legal review date'},

      {category:'Job Compliance',name:'Signed Estimate / Contract',applies:'Customer project',monitor:'Signed / approved before work'},
      {category:'Job Compliance',name:'Customer Agreement / Consent & Acknowledgment',applies:'Job-specific company requirement',monitor:'Signed date; source of truth belongs to Job'},
      {category:'Job Compliance',name:'Change Order / Additional Work Authorization',applies:'When scope or price changes',monitor:'Signed before additional work'},
      {category:'Job Compliance',name:'Stain / Color Selection Acknowledgment',applies:'When customer selects stain/color',monitor:'Signed/confirmed before application'},
      {category:'Job Compliance',name:'Completion / Final Acceptance',applies:'Closeout when used',monitor:'Signed at completion'},
      {category:'Job Compliance',name:'Lien Waiver / Release',applies:'When required by contract/payment process',monitor:'Correct stage and signature'},
      {category:'Job Compliance',name:'Permit / Inspection Documents',applies:'Only when the scope/jurisdiction requires them',monitor:'Approval / closeout'},

      {category:'Safety & Certifications',name:'Safety Data Sheets (SDS)',applies:'Hazardous chemicals/products used',monitor:'Current and accessible'},
      {category:'Safety & Certifications',name:'EPA Lead-Safe / RRP Firm & Renovator Certifications',applies:'Covered pre-1978 paint-disturbing work',monitor:'Certification expiration'},
      {category:'Safety & Certifications',name:'OSHA / Safety Training & Incident Records',applies:'As required by company size, task and rules',monitor:'Training date / retention'},

      {category:'Tax & Admin',name:'Georgia Sales & Use Tax Account / contractor tax records',applies:'Contractor operations',monitor:'Registration/status'},
      {category:'Tax & Admin',name:'EIN Confirmation',applies:'Company',monitor:'Permanent record'},
      {category:'Tax & Admin',name:'1099 / Vendor Tax File',applies:'Reportable subcontractor/vendor payments',monitor:'Year-end completeness'},
      {category:'Tax & Admin',name:'Corporate annual records / Certificate of Existence',applies:'As needed for banking, contracts or verification',monitor:'Current copy when requested'}
    ]
  };

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function load(){
    try{const v=JSON.parse(localStorage.getItem(STORE_KEY)||'null');if(v&&Array.isArray(v.records))return v;}catch(e){}
    const d=clone(defaults);save(d);return d;
  }
  function save(data){localStorage.setItem(STORE_KEY,JSON.stringify(data));dispatch();return data;}
  function parseDate(v){if(!v)return null;const d=new Date(v+'T00:00:00');return isNaN(d)?null:d;}
  function daysBetween(a,b){return Math.ceil((b-a)/(1000*60*60*24));}
  function derivedStatus(r){
    if(['Missing','Signature Needed','Review Needed','Not Applicable'].includes(r.status))return r.status;
    if(r.status==='Signed')return 'Signed';
    const exp=parseDate(r.expirationDate);const now=parseDate(TODAY);
    if(exp&&now){const days=daysBetween(now,exp);if(days<0)return 'Expired';if(days<=30)return 'Expiring Soon';}
    const review=parseDate(r.reviewDate);
    if(review&&now&&daysBetween(now,review)<=14)return 'Review Needed';
    return r.status||'Current';
  }
  function isIssue(r){return ['Expired','Expiring Soon','Missing','Signature Needed','Review Needed'].includes(derivedStatus(r));}
  function issues(){return load().records.filter(isIssue);}
  function currentCount(){return load().records.filter(r=>['Current','Signed'].includes(derivedStatus(r))).length;}
  function categoryRecords(category){return load().records.filter(r=>!category||category==='All'||r.category===category);}
  function getRecord(id){return load().records.find(r=>r.id===id)||null;}
  function updateRecord(id,fn){const d=load();const r=d.records.find(x=>x.id===id);if(!r)return null;fn(r);save(d);return r;}
  function renewRecord(id){return updateRecord(id,r=>{const base=parseDate(r.expirationDate)||parseDate(TODAY);if(base){base.setFullYear(base.getFullYear()+1);r.expirationDate=base.toISOString().slice(0,10);}r.status='Current';r.notes=(r.notes||'')+' Renewed in demo.';});}
  function markReviewed(id){return updateRecord(id,r=>{r.status='Current';r.reviewDate='2027-09-21';r.notes=(r.notes||'')+' Reviewed in demo.';});}
  function markSigned(id){return updateRecord(id,r=>{r.status='Signed';r.signedDate=TODAY;r.effectiveDate=TODAY;});}
  function addRecord(record){const d=load();record.id=record.id||('cmp-'+Date.now());d.records.unshift(record);save(d);return record;}
  function ensureJobAgreement(job){
    if(!job||job.company!=='Direct Homeowner')return null;
    const d=load();let r=d.records.find(x=>x.category==='Job Compliance'&&x.documentType==='Customer Agreement / Consent & Acknowledgment'&&(x.jobId===job.id||x.entity===job.customer));
    if(!r){r={id:'job-'+job.id+'-consent',category:'Job Compliance',entityType:'Job',entity:job.customer,documentType:'Customer Agreement / Consent & Acknowledgment',level:'Company-required job signature',status:'Missing',effectiveDate:'',expirationDate:'',signedDate:'',jobId:job.id,linkedTo:job.address,notes:'Created automatically for a direct-homeowner demo job.'};d.records.push(r);save(d);}return r;
  }
  function getJobAgreement(job){if(!job)return null;const d=load();return d.records.find(x=>x.category==='Job Compliance'&&x.documentType==='Customer Agreement / Consent & Acknowledgment'&&(x.jobId===job.id||x.entity===job.customer))||ensureJobAgreement(job);}
  function markJobAgreementSigned(job){const r=getJobAgreement(job);if(!r)return null;return markSigned(r.id);}
  function statusClass(status){const s=status||'';if(['Current','Signed'].includes(s))return 'green';if(['Expiring Soon','Review Needed','Signature Needed'].includes(s))return 'amber';if(['Expired','Missing'].includes(s))return 'red';return 'gray';}
  function dispatch(){try{window.dispatchEvent(new CustomEvent('gtf-compliance-changed'));}catch(e){}updateNavBadges();}
  function updateNavBadges(){const count=issues().length;document.querySelectorAll('.compliance-nav-alert').forEach(el=>{el.textContent=count>9?'9+':String(count);el.hidden=count===0;el.title=count?`${count} compliance item${count===1?'':'s'} need attention`:'No compliance alerts';});}
  document.addEventListener('DOMContentLoaded',updateNavBadges);
  window.addEventListener('storage',updateNavBadges);
  window.addEventListener('gtf-compliance-changed',updateNavBadges);
  window.GTFCompliance={STORE_KEY,TODAY,load,save,derivedStatus,isIssue,issues,currentCount,categoryRecords,getRecord,updateRecord,renewRecord,markReviewed,markSigned,addRecord,ensureJobAgreement,getJobAgreement,markJobAgreementSigned,statusClass,updateNavBadges,reset(){localStorage.removeItem(STORE_KEY);const d=load();dispatch();return d;}};
})();