/* global TrelloPowerUp */

var Promise = TrelloPowerUp.Promise;

//                              Setting Badge Durations
////////////////////////////////////////////////////////////////////////////////////////////

//Here we set the duration badge and update card end dates using the last 50 actions
var getBadges = function(t){
  return t.card('customFieldItems')
  .then((fields) => find_duration(fields))
  .then(function(duration){
    // console.log('We just loaded the duration: ', duration);
    check_cards_in_done_list_for_end_times(t);
    return [{
      // dynamic badges can have their function rerun after a set number
      // of seconds defined by refresh. Minimum of 10 seconds.
      dynamic: function(){
        // we could also return a Promise that resolves to this as well if we needed to do something async first
        return {
          title: 'Duration', // for detail badges only
          text: duration.str,
          color: get_time_color(duration.number),
          refresh: 10 // in seconds
        };
      }
    }];
  });
};


function addAuthToken(str){
  return str + "&key=ebc310e38e2e0fe0d33cc0eba8eeb024&token=bcb740e1385d254f27f4c99346788dc13536c86da93a946cf6ecb6234a258608";
}

function find_duration(fields){
 let dates = [];
 for(let i = 0 ; i < fields.customFieldItems.length ; i++){
   if(fields.customFieldItems[i].value.date != undefined){
     dates.push(fields.customFieldItems[i].value.date);
   }
 }
 let d2 = new Date();
 let d1 = new Date();
 
 if(dates.length > 0){
   d1 = new Date(dates[0]);
   if(dates.length > 1){
     d2 = new Date(dates[1]);  
   }
 }
  let duration = Math.abs(d2 - d1);
  return formatted_duration(duration);
}

function formatted_duration(duration){
  let min = 60000;
  let hour = 3600000;
  let day = 86400000;
  let week = 604800000;
  
  if(duration < min){
    return {"str" : ms_to_seconds(duration).toFixed(2) + " sec", 
            "number" : duration};
  }
  else if(duration < 2*hour){
    return {"str" : ms_to_minutes(duration).toFixed(2) + " min" , "number" : duration};
  }
  else if(duration < 2* day){
    return {"str" : ms_to_hours(duration).toFixed(2) + " hours" , "number" : duration};
  }
  else if(duration < 2* week){
    return {"str" : ms_to_days(duration).toFixed(2) + " days" , "number" : duration};
  }
  else if(duration >= 2* week){
    return {"str" : ms_to_week(duration).toFixed(2) + " weeks" , "number" : duration};
  }
  else{
    return {"str" : "No Duration" , "number" : duration};
  }
}


function ms_to_seconds(duration){
  return duration / 1000;
}
  
function ms_to_minutes(duration){
  return duration / 1000 / 60;
}

function ms_to_hours(duration){
  return duration / 1000 / 60 / 60;
}

function ms_to_days(duration){
  return duration /1000 /60 / 60 / 24;
}

function ms_to_week(duration){
  return duration /1000 /60 / 60 / 24 / 7;
}

function get_time_color(duration){
  let min = 60000;
  let hour = 3600000;
  let day = 86400000;
  let week = 604800000;
  
  if(duration < min){
    return "green";
  }
  else if(duration < 2*hour){
    return "yellow";
  }
  else if(duration < 2* day){
    return "orange";
  }
  else if(duration < 2* week){
    return "red";
  }
  else if(duration >= 2* week){
    return "dark_red";
  }
  else{
    return "none";
  }
}

//                              Update Cards Based on Actions
////////////////////////////////////////////////////////////////////////////////////////////

var global_board_id;
var actions_json;
var completed_id = -1;
var complete_board_info = -1;

function check_cards_in_done_list_for_end_times(t){
  // console.log("Here is the t: ", t, t.getContext());
  // debugger;
  let board_id = t.getContext().board;
  if(global_board_id != board_id){
    console.log("Board Id Changed : ",  board_id);
    global_board_id = board_id;
    return scan_actions(board_id) //this gets called a single time since we only need the actions set once.
      .then((actions_json) => update_cards_moved_to_the_done_list(actions_json));
  }
}

function scan_actions(board_id){
  let url = "https://api.trello.com/1/boards/" 
    + board_id + "/actions?key=ebc310e38e2e0fe0d33cc0eba8eeb024&token=bcb740e1385d254f27f4c99346788dc13536c86da93a946cf6ecb6234a258608&filter=updateCard:idList"
  return fetch(url, {method: 'GET', headers: {'content-type': 'application/json'}})
    .then((response) => response.json());
}

function update_cards_moved_to_the_done_list(actions_json){
  console.log("actions: ", actions_json);
  for(var i = 0 ; i < actions_json.length ; i++){ //since this is a asynchronous loop, it needs to have a private copy of the action it is operating on. If this doesn't work I'll try a primitive
    let local_func_exe = (function() {
      let local_scope_action_index  = i; // A copy of i only available to the scope of the inner function
      return function() {
        if(moved_to_done(actions_json[local_scope_action_index])){
        set_end_date(actions_json[local_scope_action_index]);
      }
    }
  })(); 
  local_func_exe(); //Execute the local scope function you created
  }//end loop
}//end outer

function moved_to_done(action){
  // console.log("Checking if action moved it to done: ", action.data.card.idShort);
  return (action.data.listAfter.name == "Done");
}

function set_end_date(action){
  let date = action.date;
  let card_id = action.data.card.id;
  
  if(complete_board_info > 0 && completed_id > 0){
    return set_custom_field(completed_id, card_id, date)
  }
  else{
    let url = "https://api.trello.com/1/boards/" +
      action.data.board.id + "/?list&cards=visible&card_fields=name&customFields=true&card_customFieldItems=true";
    url = addAuthToken(url);
    return fetch(url, {method: 'GET', headers: {'content-type': 'application/json'}})
    .then((response) => response.json())
    .then((board_data) => set_global_response(board_data))
    .then((customFieldTypes) => find_date_completed_field_id(customFieldTypes))
    .then((field_id) => set_custom_field(field_id, card_id, date));
  }  
}

function set_global_response(board_data){
  complete_board_info = board_data;
  return board_data.customFields;
}

function set_custom_field(custom_field, card_id, date){
  var url = "https://api.trello.com/1/cards/"+card_id+"/customField/"+custom_field+"/item?";
  url = addAuthToken(url);
  var data = {value: { date: date }};
  return fetch(url, { body: JSON.stringify(data), method: 'PUT', headers: {'content-type': 'application/json'}})
  .then((resp) => resp.json())
  .then(function(updated){
    // console.log("End Date Updated: ", updated);
    return updated.value.date; //return the date completed field so we can set the duration badge
  })
  .catch((err) => console.log(JSON.stringify(err, null, 2)));
}
  
function find_date_completed_field_id(custom_fields){
  try{
    // console.log("Custom Fields", custom_fields);
    for(let field of custom_fields){
        if(field.name == "Date Completed"){
          completed_id = field.id;
          return field.id;
        }
      }
  }
  catch(e){
    console.log("Error - Here be the customs fields", e, custom_fields);
  }
}

TrelloPowerUp.initialize({
  'card-badges': function(t, options){
    return getBadges(t);
  },
  'card-detail-badges': function(t, options) {
    return getBadges(t);
  },
});