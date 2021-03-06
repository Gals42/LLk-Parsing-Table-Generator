/*!
 * LL(k) Parsing Table Generator
 * https://github.com/rkocman/LLk-Parsing-Table-Generator
 * Authors: Radim Kocman and Dušan Kolář
 */

/*!
 * Requires:
 * libs/lodash.min.js
 * parser.js
 */


////
// COMMON FUNCTIONS
//////

// Check if a value is in an array
// @param value
// @param array
// @return {boolean} true|false
function inArray(el, array) {
  return (_.indexOf(array, el) === -1)? false : true;
};

// Add unique value into an array
// @param value
// @param array
function addToArray(el, array) {
  if (!inArray(el, array))
    array.push(el);
};

// Add unique object into an array 
// (one array of objects, one array of flat values)
// @param object
// @param flat value
// @param array of objects
// @param array of flat values
function addToArrayFlat(el, elf, array, arrayf) {
  if (!inArray(elf, arrayf)) {
    arrayf.push(elf);
    array.push(el);
  }
};

// Find the index of a value in an array
// @param value
// @param array
// @return {number} index
// @throw "Invalid index"
function indexOf(el, array) {
  var index = _.indexOf(array, el);
  if (index === -1) { 
    console.log(el);
    throw "Invalid index"; 
  }
  return index;
};

// Creates a deep clone of an object
// @param old object
// @return new object
function deepClone(el) {
  return _.cloneDeep(el);
}



////
// GRAMMAR OBJECTS
//////

// Grammar Element Type
var GType = {
  T : 1, // terminal
  N : 2, // nonterminal
  
  A : 3, // abstract term
  V : 4  // value term
};

// Grammar Element
var GElement = function(value, type) {
  this.value = value;
  this.type = type;
};
GElement.prototype.isT = function() {
  return (this.type === GType.T)? true : false;
};
GElement.prototype.isN = function() {
  return (this.type === GType.N)? true : false;
};

// Grammar Rule
var GRule = function() {
  this.number;
  this.left;
  this.right = [];
};
GRule.prototype.setLeft = function(gel) {
  this.left = gel;
};
GRule.prototype.addRight = function(gel) {
  this.right.push(gel);
};

// Grammar
var Grammar = function() {
  this.N = [];        // nonterminals
  this.Nf = [];         // only values
  this.T = [];        // terminals
  this.Tf = [];         // only values
  this.R = [];        // rules  
  this.Rcount = 0;    // the number of rules
  this.S = undefined; // the starting nonterminal
};
Grammar.prototype.addT = function(gel) {
  addToArrayFlat(gel, gel.value, this.T, this.Tf);
};
Grammar.prototype.addR = function(grule) {
  this.Rcount++;
  grule.number = this.Rcount;
  this.R.push(grule);
};
Grammar.prototype.parseR = function() {
  // set S
  this.S = this.R[0].left;
  
  // fill N and T
  this.T = [];
  this.Tf = [];
  var grulei, gelj;
  for (var i = 0; i < this.R.length; i++) {
    grulei = this.R[i];
    
    addToArrayFlat(grulei.left, grulei.left.value, this.N, this.Nf);
    
    for (var j = 0; j < grulei.right.length; j++) {
      gelj = grulei.right[j];
      
      if (gelj.isN()) addToArrayFlat(gelj, gelj.value, this.N, this.Nf);
      if (gelj.isT()) addToArrayFlat(gelj, gelj.value, this.T, this.Tf);
    }
  }
};



////
// INPUT PARSER MODIFICATION
//////

parser.yy.parseError = function parseError(str, hash) {
    throw hash.line+1;
};



////
// INPUT PARSER HANDLER
//////

// Parser Handler Status
var PHStatus = {
  OK      : 0,
  FAILN   : 1, // a fail terminal 
  FAILRD  : 2, // a duplicate rule
  FAILRM  : 3, // a missing rule
  FAILRL  : 4  // a left recursive rule
};

// Parser Handler
var ParserHandler = {
  
  IG: undefined,
  status: PHStatus.OK,
  statusText: "",
  halves: undefined,
  
  start: function() {
    this.IG = new Grammar();
    this.status = PHStatus.OK;
    this.statusText = "";
    this.halves = [];
  },
  
  setT: function(array) {
    var geli;
    for (var i = 0; i < array.length; i++) {
      geli = array[i];
      
      geli.type = GType.T;
      this.IG.addT(geli);
    }
  },
  
  convert: function(gel) {
    if (gel.type === GType.V) {
      gel.type = GType.T;
      return gel;
    }
    
    if (inArray(gel.value, this.IG.Tf)) {
      gel.type = GType.T;
      return gel;
    }
    
    gel.type = GType.N;
    return gel;
  },
  
  setHalfR: function(right) {
    var grule = new GRule();
    for (var i = 0; i < right.length; i++) {
      var gel = this.convert(right[i]);
      grule.addRight(gel);
    }
    this.halves.push(grule);
  },
  
  setR: function(left, right) {
    var lgel = this.convert(left);
    
    // test the nonterminal on the left side
    if (lgel.type === GType.T) {
      this.status = PHStatus.FAILN;
      this.statusText = lgel.value;
    }
    
    // add the rule
    var grule = new GRule();
    grule.setLeft(lgel);
    for (var i = 0; i < right.length; i++) {
      var el = this.convert(right[i]);
      grule.addRight(el);
    }
    this.IG.addR(grule);
    
    // finish halves
    for (var i = this.halves.length-1; i >= 0; i--) {
      grule = this.halves[i];
      grule.setLeft(lgel);
      this.IG.addR(grule);
    }
    this.halves = [];
  },
  
  finish: function() {
    if (this.status !== PHStatus.OK) return;
    
    // test duplicate rules
    if (!this.testDuplicate()) return;
    
    // test nonterminals without rules
    if (!this.testMissing()) return;
    
    // test the left recursion
    this.testLeftRecursion();
    
    // parse rules
    this.IG.parseR();
  },
  
  testDuplicate: function() {
    var grulei, grulej, same;
    for (var i = 0; i < this.IG.R.length; i++) {
      grulei = this.IG.R[i];
      
      for (var j = 0; j < this.IG.R.length; j++) {
        grulej = this.IG.R[j];
        
        if (i === j) continue;
        if (grulei.left.value !== grulej.left.value) continue;
        if (grulei.right.length !== grulej.right.length) continue;
        
        same = true;
        for (var k = 0; k < grulei.right.length; k++) {
          if (grulei.right[k].value !== grulej.right[k].value) same = false;
        }
        if (same) { 
          this.status = PHStatus.FAILRD;
          this.statusText = grulei.left.value;
          return false;
        }
      }
    }
    return true;
  },
  
  testMissing: function() {
    var grulei, gelj, found;
    var onleft = [];
    var onright = [];
    
    // fill arrays
    for (var i = 0; i < this.IG.R.length; i++) {
      grulei = this.IG.R[i];
      onleft.push(grulei.left.value);
      
      for (var j = 0; j < grulei.right.length; j++) {
        gelj = grulei.right[j];
        if (gelj.isN())
          onright.push(gelj.value);
      }
    }
    
    // check for the missings
    for (var i = 0; i < onright.length; i++) {
      found = false;
      for (var j = 0; j < onleft.length; j++) {
        if (onright[i] === onleft[j]) {
          found = true;
          break;
        }
      }
      if (!found) {
        this.status = PHStatus.FAILRM;
        this.statusText = onright[i];
        return false;
      }
    }
    
    return true;
  },
  
  prepareEmptySet: function() {
    var grulei, gelj;
    var olds = [];
    var news = [];
    
    do {
      olds = news;
      news = [];
      
      for (var i = 0; i < this.IG.R.length; i++) {
        grulei = this.IG.R[i];
        
        // count rules with eps
        if (grulei.right.length === 0) {
          news.push(grulei.left.value);
          continue;
        }
        
        // count rules with all eps nonterminals
        for (var j = 0; j < grulei.right.length; j++) {
          gelj = grulei.right[j];
          
          if (gelj.isT()) 
            break;
          
          if (inArray(gelj.value, olds)) {
            if (j !== grulei.right.length-1)
              continue;
            else
              news.push(grulei.left.value);
          }
          
          break;
        }
      }
      
    } while (olds.length !== news.length);
    
    return news;
  },
  
  testLeftRecursion: function() {
    var grulei, gelj;
    var empty = this.prepareEmptySet();
    
    for (var i = 0; i < this.IG.R.length; i++) {
      grulei = this.IG.R[i];
      
      for (var j = 0; j < grulei.right.length; j++) {
        gelj = grulei.right[j];
        
        if (gelj.isT()) break;
        
        this.testLeftRecusion_cont([], gelj.value, empty);
        
        if (!inArray(gelj.value, empty)) break;
      }
    }
  },
  
  testLeftRecusion_cont: function(before, current, empty) {
    var grulei, gelj;
    
    if (inArray(current, before)) {
      this.status = PHStatus.FAILRL;
      this.statusText = current;
      return;
    }
    
    before = before.concat([current]);
    
    for (var i = 0; i < this.IG.R.length; i++) {
      grulei = this.IG.R[i];
      
      if (grulei.left.value !== current) continue;
      
      for (var j = 0; j < grulei.right.length; j++) {
        gelj = grulei.right[j];
        
        if (gelj.type === GType.T) break;
        
        this.testLeftRecusion_cont(before, gelj.value, empty);
        
        if (!inArray(gelj.value, empty)) break;
      }
    }
  }
  
};



////
// STANDARD LL(k) PARSING TABLE GENERATOR
//////

// Standard LL(k) Parsing Table Generator Status
var TGStatus = {
  OK    : "ok",
  ERROR : "error"
};

// LL(k) Table Follow Element
var FollowEl = function(N, sets) {
  this.N = N;
  this.sets = sets;
};

// LL(k) Table Row
var LLkTRow = function(u, grule, F) {
  this.u = u;
  this.prod = grule;
  this.follow = F;
};

// LL(k) Table
var LLkT = function(count, A, L) {
  this.name = "T"+count;
  this.number = count;
  
  this.N = A;
  this.L = L;
  
  this.rows = [];
};
LLkT.prototype.addRow = function(ltrow) {
  this.rows.push(ltrow);
};
LLkT.prototype.toFlat = function() {
  var flat = "T:"+this.N.value+",{";
  for (var i = 0; i < this.L.length; i++) {
    for (var j = 0; j < this.L[i].str.length; j++) {
      flat += this.L[i].str[j].value;
      if (j !== this.L[i].str.length-1)
        flat += ":";
    }
    if (i !== this.L.length-1)
      flat += ",";
  }
  flat += "}";
  return flat;
};

// First(k) String
var FirstKEl = function(k) {
  this.leftk = k;
  this.k = 0;
  this.str = [];
};
FirstKEl.prototype.addGEl = function(gel) {
  this.leftk--;
  this.k++;
  this.str.push(gel);
};
FirstKEl.prototype.clone = function() {
  return deepClone(this);
};
FirstKEl.prototype.toFlat = function() {
  var flat = "";
  for (var i = 0; i < this.str.length; i++) {
    flat += this.str[i].value;
    if (i !== this.str.length-1)
      flat += ":";
  }
  return flat;
};

// Standard LL(k) Parsing Table Element Type
var PTEType = {
  ACCEPT : 0,
  POP : 1,
  EXPAND : 2
};

// Standard LL(k) Parsing Table Element
var PTEl = function(type, str, rule) {
  this.type = type;
  this.str = str;
  this.rule = rule;
};

// Standard LL(k) Parsing Table First Index Type
var PTFIType = {
  N   : 1, // anonterminal
  T   : 2, // a terminal
  BOT : 3  // the bottom of a pushdown
};

// Standard LL(k) Parsing Table First Index
var PTFirstIn = function(type, value) {
  this.type = type;
  this.value = value;
};
PTFirstIn.prototype.toFlat = function() {
  var flat;
  switch(this.type) {
    case PTFIType.N: flat = this.value; break;
    case PTFIType.T: flat = ":"+this.value; break;
    case PTFIType.BOT: flat = "|$"; break;
  }
  return flat;
};

// Standard LL(k) Parsing Table Second Index Type
PTSIType = {
  STR : 1, // terminals
  END : 2  // the end of an input
};

// Standard LL(k) Parsing Table Second Index
var PTSecondIn = function(type, str) {
  this.type = type;
  this.str = str;
};
PTSecondIn.prototype.toFlat = function() {
  var flat = "";
  switch(this.type) {
    case PTSIType.STR:
      for (var i = 0; i < this.str.length; i++) {
        flat += this.str[i].value;
        if (i !== this.str.length-1)
          flat += ":";
      }
      break;
    case PTSIType.END: flat = ""; break;
  }
  return flat;
};

// Standard LL(k) Parsing Table
var ParsingTable = function() {
  this.fi = [];  // the first index
  this.fif = [];   // only values
  this.si = [];  // the second index
  this.sif = [];   // only values
  
  this.field = [];
};
ParsingTable.prototype.init = function(T, Tcounter, k) {
  // the first index
  var nfi;
  for (var i = 0; i < Tcounter; i++) {
    nfi = new PTFirstIn(PTFIType.N, "T"+i);
    this.fi.push(nfi);
    this.fif.push(nfi.toFlat());
  }
  for (var i = 0; i < T.length; i++) {
    nfi = new PTFirstIn(PTFIType.T, T[i].value);
    this.fi.push(nfi);
    this.fif.push(nfi.toFlat());
  }
  nfi = new PTFirstIn(PTFIType.BOT);
  this.fi.push(nfi);
  this.fif.push(nfi.toFlat());
  
  // the second index
  var nsi;
  var ins = [];
  for (var ki = 0; ki < k; ki++) {
    ins[ki] = 0;
  }
  while (ins[0] < T.length) {
    nsi = new PTSecondIn(PTSIType.STR, []);
    for (var ki = 0; ki < k; ki++) {
      if (ins[ki] < T.length)
        nsi.str.push(T[ins[ki]]);
    }
    ins[k-1]++;
    for (var ki = k-1; ki >= 0; ki--) {
      if (ins[ki] > T.length) {
        ins[ki-1]++;
        ins[ki] = 0;
      }
    }
    addToArrayFlat(nsi, nsi.toFlat(), this.si, this.sif);
  }
  nfi = new PTSecondIn(PTSIType.END);
  this.si.push(nfi);
  this.sif.push(nfi.toFlat());
  
  // fields
  for (var i = 0; i < this.fi.length; i++) {
    this.field[i] = [];
    for (var j = 0; j < this.si.length; j++) {
      this.field[i][j] = [];
    }
  }
};
ParsingTable.prototype.addEl = function(fiFlat, siFlat, ptel) {
  var fi, si;
  fi = indexOf(fiFlat, this.fif);
  si = indexOf(siFlat, this.sif);
  this.field[fi][si].push(ptel);
};
ParsingTable.prototype.convSiSTRToFiFlat = function(sel) {
  return ":"+sel.str[0].value;
};
ParsingTable.prototype.convUToSiFlat = function(u) {
  var flat = "";
  for (var i = 0; i < u.str.length; i++) {
    flat += u.str[i].value;
    if (i !== u.str.length-1)
      flat += ":";
  }
  return flat;
};

// Standard LL(k) Parsing Table Generator
var TableGenerator = {
  
  IG: undefined,
  k: undefined,
  
  Tcounter: 0,
  
  LLks: [],
  LLksf: [],
  PT: undefined,
  
  status: TGStatus.OK,
  
  construct: function(IG, k) {
    this.IG = IG;
    this.k = k;
    this.Tcounter = 0;
    this.LLks = [];
    this.LLksf = [];
    this.PT = new ParsingTable();
    this.status = TGStatus.OK;
    
    this.constructLLkTs();
    this.PT.init(this.IG.T, this.Tcounter, this.k);
    this.fillPT();
    
    this.checkValidity();
  },
  
  constructLLkTs: function() {
    //(1)
    var t0 = this.constructLLkT(this.IG.S, [new FirstKEl(this.k)]);
    this.LLks.push(t0);
    
    //(2)
    var J = this.LLksf;
    J.push(t0.toFlat());
    
    //(3)(4)
    var tabi, rowj, folk, newt, newtf;
    for (var i = 0; i < this.LLks.length; i++) {
      tabi = this.LLks[i];
      for (var j = 0; j < tabi.rows.length; j++) {
        rowj = tabi.rows[j];
        for (var k = 0; k < rowj.follow.length; k++) {
          folk = rowj.follow[k];
          
          newt = new LLkT(0, folk.N, folk.sets);
          newtf = newt.toFlat();
          if (!inArray(newtf, J)) {
            newt = this.constructLLkT(folk.N, folk.sets);
            this.LLks.push(newt);
            J.push(newtf);
          }
        }
      }
    }
    
  },
  
  constructLLkT: function(N, L) {
    var table = new LLkT(this.Tcounter, N, L);
    this.Tcounter++;
    
    var first, setu, rulei, ltrow, follow;
    for (var i = 0; i < this.IG.R.length; i++) {
      rulei = this.IG.R[i];
      
      // skip irrelevant rules
      if (rulei.left.value !== N.value) continue;
      
      // compute u
      first = this.firstOp(rulei.right);
      setu = this.firstPlusOp(first, L);
      
      // compute follow
      follow = this.followOp(rulei.right, L);
      
      // add rows
      for (var j = 0; j < setu.length; j++) {
        ltrow = new LLkTRow(setu[j], rulei, follow);
        table.addRow(ltrow);
      }
    }
    
    return table;
  },
  
  firstOp: function(right) {
    var set = [new FirstKEl(this.k)];
    var set2 = [];
    
    for (var i = 0; i < right.length; i++) {
      for (var j = 0; j < set.length; j++) {
        
        // only uncomplete
        if (set[j].leftk <= 0) {
          set2.push(set[j]);
          continue;
        }
        
        // add terminals
        if (right[i].isT()) {
          set[j].addGEl(right[i]);
          set2.push(set[j]);
          continue;
        }
        
        // expand nonterminals
        set2 = set2.concat(this.firstOp_exp(set[j], right[i]));
        
      }
      set = set2;
      set2 = [];
    }
    
    return set;
  },
  
  firstOp_exp: function(el, N) {
    var set = [el.clone()];
    var set2 = [];
    var set3 = [];
    
    for (var r = 0; r < this.IG.R.length; r++) {
      var cr = this.IG.R[r];
      
      // skip irrelevant rules
      if (cr.left.value !== N.value) continue;
      
      for (var i = 0; i < cr.right.length; i++) {
        for (var j = 0; j < set.length; j++) {
          
          // only uncomplete
          if (set[j].leftk <= 0) {
            set2.push(set[j]);
            continue;
          }
          
          // add terminals
          if (cr.right[i].type === GType.T) {
            set[j].addGEl(cr.right[i]);
            set2.push(set[j]);
            continue;
          }
          
          // expand nonterminals
          set2 = set2.concat(this.firstOp_exp(set[j], cr.right[i]));
          
        }
        set = set2;
        set2 = [];
      }
      
      set3 = set3.concat(set);
      set = [el.clone()];
      set2 = [];
    }
    
    return set3;
  },
  
  firstPlusOp: function(set1, set2) {
    var ip, jp, fel;
    var result = [];
    var resultcheck = [];
    
    for (var i = 0; i < set1.length; i++) {
      for (var j = 0; j < set2.length; j++) {
        
        ip = 0; jp = 0; fel = new FirstKEl(this.k);
        for (var k = 0; k < this.k; k++) {
          if (ip < set1[i].str.length) {
            fel.addGEl(set1[i].str[ip]);
            ip++;
            continue;
          }
          if (jp < set2[j].str.length) {
            fel.addGEl(set2[j].str[jp]);
            jp++;
            continue;
          }
          break;
        }
        addToArrayFlat(fel, fel.toFlat(), result, resultcheck);
        
      }
    }
    
    return result;
  },
  
  followOp: function(right, L) {
    var result = [];
    var geli, rest, follow;
    var first, setu;
    
    for (var i = 0; i < right.length; i++) {
      geli = right[i];
      
      // skip terminals
      if (geli.isT()) continue;
      
      // create rest
      rest = [];
      for (var j = i+1; j < right.length; j++) {
        rest.push(right[j]);
      }
      
      // compute u
      first = this.firstOp(rest);
      setu = this.firstPlusOp(first, L);
      
      // add to the result
      follow = new FollowEl(geli, setu);
      result.push(follow);
    }
    
    return result;
  },
  
  convNToTableName: function(N, L) {
    var t = new LLkT(0, N, L);
    var tf = t.toFlat();
    var i = indexOf(tf, this.LLksf);
    var lt = this.LLks[i];
    return new GElement(lt.name, GType.N);
  },
  
  fillPT: function() {
    var fiv, siv, el; 
    var PT = this.PT;
    
    //(1) expand
    var tabi, rowj, gelk, nontl, gelnew;
    for (var i = 0; i < this.LLks.length; i++) {
      tabi = this.LLks[i];
      for (var j = 0; j < tabi.rows.length; j++) {
        rowj = tabi.rows[j];
        
        el = new PTEl(PTEType.EXPAND);
        el.rule = rowj.prod;
        el.str = [];
        
        // convert the right side of a rule
        nontl = 0;
        for (var k = 0; k < rowj.prod.right.length; k++) {
          gelk = rowj.prod.right[k];
          
          if (gelk.isT()) {
            el.str.push(gelk);
          } else {
            gelnew = this.convNToTableName(gelk, rowj.follow[nontl].sets);
            el.str.push(gelnew);
            nontl++;
          }
        }
        
        fiv = tabi.name;
        siv = PT.convUToSiFlat(rowj.u);
        PT.addEl(fiv, siv, el);
      }
    }
    
    //(2) pop
    var sii;
    for (var i = 0; i < PT.si.length; i++) {
      sii = PT.si[i];
      if (sii.type !== PTSIType.STR) continue;
      
      el = new PTEl(PTEType.POP);
      fiv = PT.convSiSTRToFiFlat(sii);
      siv = sii.toFlat();
      PT.addEl(fiv, siv, el);
    }
    
    //(3) accept
    var fie, sie;
    el = new PTEl(PTEType.ACCEPT);
    fie = new PTFirstIn(PTFIType.BOT);
    sie = new PTSecondIn(PTSIType.END);
    fiv = fie.toFlat();
    siv = sie.toFlat();
    PT.addEl(fiv, siv, el);
    
    //(4)(5)
    //nothing
  },
  
  checkValidity: function() {
    var PT = this.PT;
    var field = this.PT.field;
    
    for (var i = 0; i < PT.fi.length; i++) {
      for (var j = 0; j < PT.si.length; j++) {
        if (field[i][j].length > 1)
          this.status = TGStatus.ERROR;
      }
    }
  }
  
};



////
// EXTENDED LL(k) PARSING TABLE GENERATOR
//////

// Extended LL(k) Parsing Table Element Type
var EPTEType = {
  ACCEPT : 0,
  POP : 1,
  EXPAND : 2,
  CHANGE : 3
};

// Extended LL(k) Parsing Table Element
var EPTEl = function(type, str, rule) {
  this.type = type;
  this.str = str;
  this.rule = rule;
};

// Extended LL(k) Parsing Table First Index Type
var EPTFIType = {
  N    : 1, // a nonterminal
  PT   : 2, // a pushdown terminal
  PBOT : 3, // the bottom of a pushdown
  IT   : 4, // an input terminal
  IEND : 5  // the end of an input
};

// Extended LL(k) Parsing Table First Index
var EPTFirstIn = function(type, value) {
  this.type = type;
  this.value = value;
};
EPTFirstIn.prototype.toFlat = function() {
  var flat;
  switch(this.type) {
    case EPTFIType.N: flat = this.value; break;
    case EPTFIType.PT: flat = ":"+this.value; break;
    case EPTFIType.PBOT: flat = ":#"; break;
    case EPTFIType.IT: flat = "|"+this.value; break;
    case EPTFIType.IEND: flat = "|$"; break;
  }
  return flat;
};

// Extended LL(k) Parsing Table Second Index
var EPTSecondIn = function(str) {
  this.str = str;
};
EPTSecondIn.prototype.toFlat = function() {
  var flat = "";
  for (var i = 0; i < this.str.length; i++) {
    flat += this.str[i].value;
    if (i !== this.str.length-1)
      flat += ":";
  }
  return flat;
};

// Extended LL(k) Parsing Table
var ExtendedParsingTable = function() {
  this.fi = [];  // the first index
  this.fif = [];   // only values
  this.si = [];  // the second index
  this.sif = [];   // only values
  
  this.field = [];
};
ExtendedParsingTable.prototype.init = function(T, PT, k) {
  // the first index
  var nfi, ptfi;
  for (var i = 0; i < PT.fi.length; i++) {
    ptfi = PT.fi[i];
    switch(ptfi.type) {
      case PTFIType.N:
        nfi = new EPTFirstIn(EPTFIType.N, ptfi.value); break;
      case PTFIType.T:
        nfi = new EPTFirstIn(EPTFIType.PT, ptfi.value); break;
      case PTFIType.BOT:
        nfi = new EPTFirstIn(EPTFIType.PBOT); break;
    }
    this.fi.push(nfi);
    this.fif.push(nfi.toFlat());
  }
  for (var i = 0; i < T.length; i++) {
    nfi = new EPTFirstIn(EPTFIType.IT, T[i].value);
    this.fi.push(nfi);
    this.fif.push(nfi.toFlat());
  }
  nfi = new EPTFirstIn(EPTFIType.IEND);
  this.fi.push(nfi);
  this.fif.push(nfi.toFlat());
  
  // the second index
  var nsi, ptsi;
  var nend = new GElement("$", GType.T);
  nsi = new EPTSecondIn([]);
  this.si.push(nsi);
  this.sif.push(nsi.toFlat());
  for (var kless = 1; kless < k; kless++) {
    var ins = [];
    for (var ki = 0; ki < kless; ki++) {
      ins[ki] = 0;
    }
    while (ins[0] < T.length) {
      nsi = new EPTSecondIn([]);
      for (var ki = 0; ki < kless; ki++) {
        nsi.str.push(T[ins[ki]]);
      }
      ins[kless-1]++;
      for (var ki = kless-1; ki >= 1; ki--) {
        if (ins[ki] >= T.length) {
          ins[ki-1]++;
          ins[ki] = 0;
        }
      }
      this.si.push(nsi);
      this.sif.push(nsi.toFlat());
    }
  }
  for (var i = 0; i < PT.si.length; i++) {
    ptsi = PT.si[i];
    nsi = new EPTSecondIn([]);
    switch(ptsi.type) {
      case PTSIType.STR:
        for (var j = 0; j < k; j++) {
          if (j < ptsi.str.length) {
            nsi.str.push(ptsi.str[j]);
          } else {
            nsi.str.push(nend);
          }
        }
        break;
      case PTSIType.END:
        for (var j = 0; j < k; j++) {
          nsi.str.push(nend);
        }
        break;
    }
    this.si.push(nsi);
    this.sif.push(nsi.toFlat());
  }
  
  // fields
  for (var i = 0; i < this.fi.length; i++) {
    this.field[i] = [];
    for (var j = 0; j < this.si.length; j++) {
      this.field[i][j] = [];
    }
  }
};

// Extended LL(k) Parsing Table Generator
var ExtendedTableGenerator = {
  
  IG: undefined,
  k: undefined,
  PT: undefined,
  
  EPT: undefined,
  
  construct: function(IG, k, PT) {
    this.IG = IG;
    this.k = k;
    this.PT = PT;
    this.EPT = new ExtendedParsingTable();
    this.EPT.init(IG.T, PT, k);
    
    this.fillAccept();
    this.copyExpands();
    this.convertPops();
    this.addStateChanges();
  },
  
  convertFirstIndex: function(oldfi) {
    switch(oldfi.type) {
      case PTFIType.N:
        return new EPTFirstIn(EPTFIType.N, oldfi.value);
      case PTFIType.T:
        return new EPTFirstIn(EPTFIType.PT, oldfi.value);
      case PTFIType.BOT:
        return new EPTFirstIn(EPTFIType.PBOT);
    }
  },
  
  convertSecondIndex: function(oldsi) {
    var nsi = new EPTSecondIn([]);
    var nend = new GElement("$", GType.T);
    switch(oldsi.type) {
      case PTSIType.STR:
        for (var i = 0; i < this.k; i++) {
          if (i < oldsi.str.length) {
            nsi.str.push(oldsi.str[i]);
          } else {
            nsi.str.push(nend);
          }
        }
        return nsi;
      case PTSIType.END:
        for (var i = 0; i < this.k; i++) {
          nsi.str.push(nend);
        }
        return nsi;
    }
  },
  
  pushConverted: function(oldfi, oldsi, el) {
    var fi = this.convertFirstIndex(oldfi);
    var si = this.convertSecondIndex(oldsi);
    var i = indexOf(fi.toFlat(), this.EPT.fif);
    var j = indexOf(si.toFlat(), this.EPT.sif);
    this.EPT.field[i][j].push(el);
  },
  
  fillAccept: function() {
    var bot = new PTFirstIn(PTFIType.BOT);
    var end = new PTSecondIn(PTSIType.END);
    var accept = new EPTEl(EPTEType.ACCEPT);
    this.pushConverted(bot, end, accept);
  },
  
  copyExpands: function() {
    var cell, oldel, nel;
    for (var i = 0; i < this.PT.fi.length; i++) {
      for (var j = 0; j < this.PT.si.length; j++) {
        cell = this.PT.field[i][j];
        for (var l = 0; l < cell.length; l++) {
          oldel = cell[l];
          if (oldel.type === PTEType.EXPAND) {
            nel = new EPTEl(EPTEType.EXPAND, oldel.str, oldel.rule);
            this.pushConverted(this.PT.fi[i], this.PT.si[j], nel);
          }
        }
      }
    }
  },
  
  convertPops: function() {
    var cell, oldel, nel, nstate;
    var nend = new GElement("$", GType.T);
    for (var i = 0; i < this.PT.fi.length; i++) {
      for (var j = 0; j < this.PT.si.length; j++) {
        cell = this.PT.field[i][j];
        for (var l = 0; l < cell.length; l++) {
          oldel = cell[l];
          if (oldel.type === PTEType.POP) {
            nstate = this.convertSecondIndex(this.PT.si[j]);
            nstate.str.splice(0, 1);
            if (this.PT.si[j].str.length < this.k)
              nstate.str.push(nend);
            nel = new EPTEl(EPTEType.POP, nstate.str);
            this.pushConverted(this.PT.fi[i], this.PT.si[j], nel);
          }
        }
      }
    }
  },
  
  addStateChanges: function() {
    var nel, nstr, csi;
    var nend = new GElement("$", GType.T);
    for (var i = 0; i < this.EPT.fi.length; i++) {
      // only relevant
      if (this.EPT.fi[i].type !== EPTFIType.IT && 
          this.EPT.fi[i].type !== EPTFIType.IEND) 
        continue;
      for (var j = 0; j < this.EPT.si.length; j++) {
        // only relevant
        if (this.EPT.si[j].str.length >= this.k)
          continue;
        
        nstr = [];
        for (var l = 0; l < this.EPT.si[j].str.length; l++) {
          nstr.push(this.EPT.si[j].str[l]);
        }
        if (this.EPT.fi[i].type === EPTFIType.IT) {
          nstr.push(new GElement(this.EPT.fi[i].value, GType.T));
        }
        if (this.EPT.fi[i].type === EPTFIType.IEND) {
          while (nstr.length < this.k) {
            nstr.push(nend);
          }
        }
        nel = new EPTEl(EPTEType.CHANGE, nstr);
        this.EPT.field[i][j].push(nel);
      }
    }
  }
  
};