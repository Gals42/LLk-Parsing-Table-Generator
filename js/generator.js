/*!
 * LL(k) Parsing Table Generator
 * https://github.com/Gals42/LLk-Parsing-Table-Generator
 * Author: Radim Kocman
 */


////
// GRAMMAR OBJECTS
//////

var GType = {
  T : 1, // terminal
  N : 2, // nonterminal
  
  A : 3, // abstract term
  V : 4  // value term
};

var GElement = function(value, type) {
  this.value = value;
  this.type = type;
};

var GRule = function() {
  this.left;
  this.right = [];
};
GRule.prototype.setLeft = function(gelement) {
  this.left = gelement;
};
GRule.prototype.addRight = function(gelement) {
  this.right.push(gelement);
};

var Grammar = function() {
  this.T = [];
  this.R = [];
};
Grammar.prototype.addT = function(gelement) {
  this.T.push(gelement);
};
Grammar.prototype.addR = function(grule) {
  this.R.push(grule);
};


////
// PARSING TABLE GENERATOR GUI
//////

var StatusClass = {
  INFO : "info",
  OK : "ok",
  ERROR : "error"
};

var PTGConfig = {
  FULL : "full",
  COMPACT : "compact"
};

var PTG = {

  inputG : undefined,
  k : undefined,
  config : undefined,

  run: function() {
    this.setInfo("Processing...");
    out.clean();
    
    if (!this.handleInputForm()) return;
    
    if (!this.handleInputParse()) return;
    if (this.config === PTGConfig.FULL) {
      out.title("Parsed Rules");
      out.grammar(ParserHandler.IG);
    }
    
    this.setOk("OK");
  },
  
  handleInputForm: function() {
    
    this.k = parseInt($("input[name=k]").val());
    if (isNaN(this.k) || this.k < 1 || this.k > 100) {
      this.setError("Error: Invalid k");
      return false;
    }
    
    this.config = $("select[name=result]").val();
    if (this.config !== PTGConfig.FULL && this.config !== PTGConfig.COMPACT) {
      this.setError("Error: Invalid output selection");
      return false;
    }
    
    this.inputG = $("textarea[name=grammar]").val();
    if (this.inputG.length === 0) {
      this.setError("Error: Empty input grammar");
      return false;
    }
    
    return true;
  },
  
  handleInputParse: function() {
    ParserHandler.start();
    try {
      parser.parse(this.inputG);
    } catch (err) {
      this.setError("Error: Invalid input grammar (error on line "+err+")");
      return false;
    }
    
    if (ParserHandler.status === PHStatus.FAILN) {
      this.setError("Error: Invalid input grammar (rule with terminal on the left side)");
      return false;
    }
    
    if (ParserHandler.status === PHStatus.FAILR) {
      this.setError("Error: Invalid input grammar (duplicate rules)");
      return false;
    }
      
    return true;
  },

  statusBar: undefined,
  setInfo: function(msg) {
    this.statusBar.text(msg);
    this.statusBar.attr("class", StatusClass.INFO);
  },
  setOk: function(msg) {
    this.statusBar.text(msg);
    this.statusBar.attr("class", StatusClass.OK);
  },
  setError: function(msg) {
    this.statusBar.text(msg);
    this.statusBar.attr("class", StatusClass.ERROR);
  }

};
$(function() {
  PTG.statusBar = $("#status span");
});


////
// CONTENT SELECT HELPER
//////

function select_all(el) {
  if (typeof window.getSelection !== "undefined" && 
      typeof document.createRange !== "undefined") {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (typeof document.selection !== "undefined" && 
    typeof document.body.createTextRange !== "undefined") {
    var textRange = document.body.createTextRange();
    textRange.moveToElementText(el);
    textRange.select();
  }
}


////
// INPUT PARSER MODIFICATION
//////

parser.yy.parseError = function parseError(str, hash) {
    throw hash.line+1;
};


////
// INPUT PARSER HANDLER
//////

var PHStatus = {
  OK : 0,
  FAILN : 1,  // Fail terminal 
  FAILR : 2   // Fail rules
};

var ParserHandler = {
  
  IG : undefined,
  status : PHStatus.OK,
  halves : undefined,
  
  start : function() {
    this.IG = new Grammar();
    this.status = PHStatus.OK;
    this.halves = [];
  },
  
  setT : function(array) {
    for (var i = 0; i < array.length; i++) {
      array[i].type = GType.T;
      this.IG.addT(array[i]);
    }
  },
  
  convert : function(el) {
    if (el.type === GType.V) {
      el.type = GType.T;
      return el;
    }
    
    el.type = GType.N;
    for (var i = 0; i < this.IG.T.length; i++) {
      if (el.value === this.IG.T[i].value) {
        el.type = GType.T;
        break;
      }
    }
    return el;
  },
  
  setHalfR : function(right) {
    var rule = new GRule();
    for (var i = 0; i < right.length; i++) {
      var el = this.convert(right[i]);
      rule.addRight(el);
    }
    this.halves.push(rule);
  },
  
  setR : function(left, right) {
    var lel = this.convert(left);
    // Test nonterminal on the left side
    if (lel.type === GType.T)
      this.status = PHStatus.FAILN;
    
    // Rule
    var rule = new GRule();
    rule.setLeft(lel);
    for (var i = 0; i < right.length; i++) {
      var el = this.convert(right[i]);
      rule.addRight(el);
    }
    this.IG.addR(rule);
    
    // Finish halves
    for (var i = this.halves.length-1; i >= 0; i--) {
      rule = this.halves[i];
      rule.setLeft(lel);
      this.IG.addR(rule);
    }
    this.halves = [];
  },
  
  finish : function() {
    // Test duplicate rules
    var rulei, rulej, same;
    for (var i = 0; i < this.IG.R.length; i++) {
      rulei = this.IG.R[i];
      
      for (var j = 0; j < this.IG.R.length; j++) {
        rulej = this.IG.R[j];
        if (i === j) continue;
        
        if (rulei.left.value !== rulej.left.value) continue;
        
        if (rulei.right.length !== rulej.right.length) continue;
        
        same = true;
        for (var k = 0; k < rulei.right.length; k++) {
          if (rulei.right[k].value !== rulej.right[k].value) same = false;
        }
        if (same) this.status = PHStatus.FAILR;
      }
      
    }
  }
  
};


////
// OUTPUT PRINTER
//////

var out = {
  
  out: undefined,
  
  clean: function() {
    this.out.html("");
  },
  
  title: function(text) {
    var html = "<h2>"+text+"</h2>";
    this.out.html(this.out.html() + html);
  },
  
  grammar: function(g) {
    var html = "<div class=\"code2\">";
    for (var i = 0; i < g.R.length; i++) {
      html += this.prepRule(g.R[i])+"<br>";
    }
    html += "</div>";
    this.out.html(this.out.html() + html);
  },
  
  prepRule: function(r) {
    var html = 
      this.prepEl(r.left)+ "→ ";
    if (r.right.length === 0)
      html += "<span class=\"eps\">ε</span> ";
    for (var i = 0; i < r.right.length; i++) {
      html += this.prepEl(r.right[i]);
    }
    return html;
  },
  
  prepEl: function(e) {
    var html = 
      "<span class=\""+((e.type === GType.N)?"n":"t")+"\">"
      +e.value+"</span> ";
    return html; 
  }
  
};
$(function() {
  out.out = $("#output");
});